-- BARAHA cloud sync, Stage 3: private storage for voice-note audio.
-- Run ONCE in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Needs supabase/001_sync_records.sql to have been run first.

-- A private bucket named "audio". Files live at  <your-user-id>/<audio-id>.
insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', false, 52428800)          -- 50 MB per file (the free plan maximum)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- Each account can only touch files inside its OWN folder.
drop policy if exists "audio select own" on storage.objects;
create policy "audio select own" on storage.objects for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "audio insert own" on storage.objects;
create policy "audio insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "audio update own" on storage.objects;
create policy "audio update own" on storage.objects for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "audio delete own" on storage.objects;
create policy "audio delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
