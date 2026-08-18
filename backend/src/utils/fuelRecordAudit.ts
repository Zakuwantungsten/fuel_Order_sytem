import { AuditService } from './auditService';

/** Numeric checkpoint columns on a FuelRecord. */
export const FUEL_CHECKPOINT_AUDIT_FIELDS = [
  'mmsaYard', 'tangaYard', 'darYard',
  'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
  'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
] as const;

/** Fields snapshotted for FuelRecord create/update audits. */
export const FUEL_RECORD_AUDIT_FIELDS = [
  'truckNo', 'goingDo', 'returnDo', 'start', 'from', 'to',
  'originalGoingFrom', 'originalGoingTo',
  'totalLts', 'extra', 'outboundLiters', 'balance', 'isLocked', 'pendingConfigReason',
  ...FUEL_CHECKPOINT_AUDIT_FIELDS,
  'date', 'month', 'lpoNo', 'journeyStatus', 'queueOrder',
  'isCancelled', 'cancelledBy',
  'completedBy', 'manuallyCompleted',
] as const;

export const FUEL_FIELD_LABELS: Record<string, string> = {
  truckNo: 'Truck',
  goingDo: 'Going DO',
  returnDo: 'Return DO',
  start: 'Start',
  from: 'From',
  to: 'To / destination',
  originalGoingFrom: 'Going from (stored)',
  originalGoingTo: 'Going destination (stored)',
  totalLts: 'Total liters',
  extra: 'Extra',
  outboundLiters: 'Outbound liters',
  balance: 'Balance',
  isLocked: 'Locked',
  pendingConfigReason: 'Pending config',
  mmsaYard: 'MMSA Yard',
  tangaYard: 'Tanga Yard',
  darYard: 'Dar Yard',
  tangaGoing: 'Tanga Going',
  darGoing: 'Dar Going',
  moroGoing: 'Morogoro Going',
  mbeyaGoing: 'Mbeya Going',
  tdmGoing: 'Tunduma Going',
  zambiaGoing: 'Zambia Going',
  congoFuel: 'Congo',
  zambiaReturn: 'Zambia Return',
  tundumaReturn: 'Tunduma Return',
  mbeyaReturn: 'Mbeya Return',
  moroReturn: 'Morogoro Return',
  darReturn: 'Dar Return',
  tangaReturn: 'Tanga Return',
  date: 'Date',
  month: 'Month',
  lpoNo: 'LPO No',
  journeyStatus: 'Journey status',
  queueOrder: 'Queue order',
  isCancelled: 'Cancelled',
  cancelledBy: 'Cancelled by',
  completedBy: 'Completed by',
  manuallyCompleted: 'Manually completed',
};

export type FuelRecordAuditSource =
  | 'manual'
  | 'lpo'
  | 'do_amend'
  | 'do_cancel'
  | 'pending_do'
  | 'yard'
  | 'system';

export interface FuelRecordAuditContext {
  username: string;
  userId?: string;
  ipAddress?: string;
  lpoNo?: string;
  station?: string;
  doNumber?: string;
  source?: FuelRecordAuditSource;
}

export interface FuelRecordAuditPayload {
  action?: 'CREATE' | 'UPDATE' | 'DELETE';
  resourceId: string;
  username: string;
  userId?: string;
  ipAddress?: string;
  previous?: Record<string, any>;
  next?: Record<string, any>;
  details?: string;
  source?: FuelRecordAuditSource;
  tags?: string[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

const LITER_FIELDS = new Set<string>([
  'totalLts', 'extra', 'outboundLiters', 'balance',
  ...FUEL_CHECKPOINT_AUDIT_FIELDS,
]);

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a || 0) === Number(b || 0);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export function fuelFieldLabel(field: string): string {
  return FUEL_FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').trim();
}

export function formatFuelAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (LITER_FIELDS.has(field) && (typeof value === 'number' || typeof value === 'string')) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}L` : String(value);
  }
  return String(value);
}

/** Snapshot the audit-relevant fields from a fuel record document or plain object. */
export function snapshotFuelRecord(
  record: any,
  fields: readonly string[] = FUEL_RECORD_AUDIT_FIELDS
): Record<string, any> {
  const snap: Record<string, any> = {};
  if (!record) return snap;
  const src = typeof record.toObject === 'function' ? record.toObject() : record;
  for (const field of fields) {
    if (src[field] !== undefined) snap[field] = src[field];
  }
  return snap;
}

export function diffFuelRecordSnapshots(
  previous?: Record<string, any> | null,
  next?: Record<string, any> | null
): { previous: Record<string, any>; next: Record<string, any>; changes: { field: string; oldValue: any; newValue: any }[] } {
  const prev = previous || {};
  const nxt = next || {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(nxt)]);
  const changes: { field: string; oldValue: any; newValue: any }[] = [];
  const prevOut: Record<string, any> = {};
  const nextOut: Record<string, any> = {};

  for (const key of keys) {
    if (valuesEqual(prev[key], nxt[key])) continue;
    changes.push({ field: key, oldValue: prev[key], newValue: nxt[key] });
    prevOut[key] = prev[key];
    nextOut[key] = nxt[key];
  }

  return { previous: prevOut, next: nextOut, changes };
}

function truckTag(truckNo?: string | null): string | undefined {
  const t = (truckNo || '').toString().trim();
  return t ? `truck:${t}` : undefined;
}

export function formatFuelRecordAuditDetails(
  changes: { field: string; oldValue: any; newValue: any }[],
  identity: { truckNo?: string; goingDo?: string; returnDo?: string },
  extra?: string
): string {
  const who = [
    identity.truckNo ? `Truck ${identity.truckNo}` : null,
    identity.goingDo ? `DO ${identity.goingDo}` : null,
    identity.returnDo ? `Return ${identity.returnDo}` : null,
  ].filter(Boolean).join(' / ');

  const parts = changes
    .filter((c) => c.field !== 'truckNo' || true)
    .map((c) => `${fuelFieldLabel(c.field)} ${formatFuelAuditValue(c.field, c.oldValue)} → ${formatFuelAuditValue(c.field, c.newValue)}`);

  const body = parts.length > 0 ? parts.join('; ') : 'updated';
  const prefix = who ? `${who}: ` : '';
  const suffix = extra ? ` (${extra})` : '';
  return `${prefix}${body}${suffix}`;
}

function identityFrom(previous?: Record<string, any>, next?: Record<string, any>) {
  return {
    truckNo: next?.truckNo ?? previous?.truckNo,
    goingDo: next?.goingDo ?? previous?.goingDo,
    returnDo: next?.returnDo ?? previous?.returnDo,
  };
}

export async function logFuelRecordChange(payload: FuelRecordAuditPayload): Promise<void> {
  const { previous: prevDiff, next: nextDiff, changes } = diffFuelRecordSnapshots(
    payload.previous,
    payload.next
  );

  if (payload.action !== 'CREATE' && changes.length === 0 && !payload.details) {
    return;
  }

  const identity = identityFrom(payload.previous, payload.next);
  // Always keep truck/DO on the stored snapshots so SuperAdmin can search by truck.
  const previousValue = payload.action === 'CREATE'
    ? undefined
    : { ...prevDiff, truckNo: identity.truckNo, goingDo: identity.goingDo, returnDo: identity.returnDo };
  const newValue = {
    ...(payload.action === 'CREATE' ? (payload.next || {}) : nextDiff),
    truckNo: identity.truckNo,
    goingDo: identity.goingDo,
    returnDo: identity.returnDo,
    ...(payload.source ? { source: payload.source } : {}),
  };

  const details = payload.details || formatFuelRecordAuditDetails(changes, identity);

  const tags = new Set<string>(['fuel-record', ...(payload.tags || [])]);
  if (payload.source) tags.add(payload.source);
  const tTag = truckTag(identity.truckNo);
  if (tTag) tags.add(tTag);
  if (changes.some((c) => (FUEL_CHECKPOINT_AUDIT_FIELDS as readonly string[]).includes(c.field))) {
    tags.add('checkpoint');
  }
  if (changes.some((c) => c.field === 'totalLts' || c.field === 'extra')) tags.add('allocation');
  if (changes.some((c) => c.field === 'truckNo')) tags.add('truck-change');
  if (changes.some((c) => c.field === 'from' || c.field === 'to' || c.field === 'start')) tags.add('route');

  await AuditService.log({
    userId: payload.userId,
    username: payload.username || 'system',
    action: payload.action || 'UPDATE',
    resourceType: 'FuelRecord',
    resourceId: payload.resourceId,
    previousValue,
    newValue,
    details,
    ipAddress: payload.ipAddress,
    severity: payload.severity || (payload.action === 'CREATE' ? 'low' : 'medium'),
    tags: Array.from(tags),
  });
}

export async function commitFuelRecordAudits(payloads: FuelRecordAuditPayload[]): Promise<void> {
  if (!payloads || payloads.length === 0) return;
  for (const payload of payloads) {
    try {
      await logFuelRecordChange(payload);
    } catch {
      // AuditService.log already swallows errors; this is a second belt.
    }
  }
}

export function queueFuelRecordAudit(
  target: FuelRecordAuditPayload[] | undefined,
  payload: FuelRecordAuditPayload
): void {
  if (target) {
    target.push(payload);
    return;
  }
  void logFuelRecordChange(payload);
}

export function buildLpoCheckpointAudit(params: {
  resourceId: string;
  record: any;
  field: string;
  previousLiters: number;
  nextLiters: number;
  previousBalance: number;
  nextBalance: number;
  litersChange: number;
  audit?: FuelRecordAuditContext;
  station?: string;
}): FuelRecordAuditPayload {
  const rec = params.record || {};
  const action = params.litersChange > 0 ? 'deducted' : 'restored';
  const abs = Math.abs(params.litersChange);
  const extraParts = [
    params.audit?.lpoNo ? `LPO ${params.audit.lpoNo}` : null,
    params.station || params.audit?.station || null,
    `${action} ${abs}L at ${fuelFieldLabel(params.field)}`,
  ].filter(Boolean);

  return {
    action: 'UPDATE',
    resourceId: params.resourceId,
    username: params.audit?.username || 'system',
    userId: params.audit?.userId,
    ipAddress: params.audit?.ipAddress,
    previous: {
      truckNo: rec.truckNo,
      goingDo: rec.goingDo,
      returnDo: rec.returnDo,
      [params.field]: params.previousLiters,
      balance: params.previousBalance,
    },
    next: {
      truckNo: rec.truckNo,
      goingDo: rec.goingDo,
      returnDo: rec.returnDo,
      [params.field]: params.nextLiters,
      balance: params.nextBalance,
    },
    details: formatFuelRecordAuditDetails(
      [
        { field: params.field, oldValue: params.previousLiters, newValue: params.nextLiters },
        { field: 'balance', oldValue: params.previousBalance, newValue: params.nextBalance },
      ],
      { truckNo: rec.truckNo, goingDo: rec.goingDo, returnDo: rec.returnDo },
      extraParts.join(' · ')
    ),
    source: 'lpo',
    tags: ['lpo', 'checkpoint'],
    severity: 'medium',
  };
}
