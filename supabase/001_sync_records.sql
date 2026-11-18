-- BARAHA cloud sync, Stage 2: one table holds every synced record for every account.
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates things that don't exist yet.

create table if not exists public.sync_records (
  user_id           uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  store             text        not null,                 -- local store name: battles, rounds, finalMaterials, ...
  id                text        not null,                 -- record id (for finalMaterials: the round id)
  data              jsonb,                                -- the record itself (null for deletions)
  updated_at        timestamptz not null,                 -- when the edit was made (device stamp); newest edit wins
  deleted           boolean     not null default false,   -- soft delete, so deletions reach your other devices
  server_updated_at timestamptz not null default clock_timestamp(),  -- set by the server; devices pull "what changed since"
  device_id         text,
  primary key (user_id, store, id)
);

create index if not exists sync_records_pull_idx on public.sync_records (user_id, server_updated_at);

-- Every account can only see and change its OWN rows.
alter table public.sync_records enable row level security;

drop policy if exists "sync_records select own" on public.sync_records;
create policy "sync_records select own" on public.sync_records
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "sync_records insert own" on public.sync_records;
create policy "sync_records insert own" on public.sync_records
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "sync_records update own" on public.sync_records;
create policy "sync_records update own" on public.sync_records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No DELETE policy on purpose: deletions are soft (deleted = true).

-- The server stamps every write itself, so a phone with a wrong clock can't break the pull order.
create or replace function public.sync_records_touch() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists sync_records_touch on public.sync_records;
create trigger sync_records_touch before insert or update on public.sync_records
  for each row execute function public.sync_records_touch();

-- Upload a batch. An existing row is only replaced if the incoming edit is NEWER.
create or replace function public.sync_push(records jsonb) returns void
language sql security invoker as $$
  insert into public.sync_records (user_id, store, id, data, updated_at, deleted, device_id)
  select auth.uid(), r->>'store', r->>'id', r->'data', (r->>'updated_at')::timestamptz,
         coalesce((r->>'deleted')::boolean, false), r->>'device_id'
  from jsonb_array_elements(records) as r
  on conflict (user_id, store, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        device_id = excluded.device_id
    where excluded.updated_at > public.sync_records.updated_at;
$$;

-- Only signed-in users may use the table and the function (never anonymous visitors).
revoke all on public.sync_records from anon;
grant select, insert, update on public.sync_records to authenticated;
revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
