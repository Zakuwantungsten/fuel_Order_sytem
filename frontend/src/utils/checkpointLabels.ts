import { FUEL_RECORD_COLUMNS } from '../services/cancellationService';

const EXTRA_CHECKPOINT_LABELS: Record<string, string> = {
  mmsaYard: 'MMSA Yard',
  tangaYard: 'Tanga Yard',
  darYard: 'DAR Yard',
};

/** Human label for a FuelRecord checkpoint field (e.g. darGoing → Dar Going). */
export function checkpointFieldLabel(field?: string | null): string {
  if (!field) return '—';
  const fromLists = [...FUEL_RECORD_COLUMNS.going, ...FUEL_RECORD_COLUMNS.return].find(
    (c) => c.field === field
  );
  if (fromLists) return fromLists.label;
  if (EXTRA_CHECKPOINT_LABELS[field]) return EXTRA_CHECKPOINT_LABELS[field];
  // Fallback: camelCase → words
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}
