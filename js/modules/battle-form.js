import { formDialog } from '../core/ui.js';
import { BATTLE_STATUSES } from '../core/store.js';

/** Shared create/edit dialog for battles. Resolves with field values or null. */
export function battleFormDialog(existing = null) {
  const b = existing || {};
  return formDialog({
    title: existing ? 'Edit battle' : 'New battle',
    submitLabel: existing ? 'Save changes' : 'Create battle',
    fields: [
      { name: 'title', label: 'Battle title', value: b.title, required: true },
      { name: 'opponentName', label: 'Opponent', value: b.opponentName },
      { name: 'league', label: 'League / event', value: b.league },
      { name: 'battleDate', label: 'Battle date', type: 'date', value: b.battleDate },
      { name: 'status', label: 'Status', type: 'select', options: BATTLE_STATUSES, value: b.status || 'Writing' },
      { name: 'location', label: 'Location (optional)', value: b.location },
    ],
  });
}
