import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, FileEdit, FilePlus, X } from 'lucide-react';

export type DOConfirmAction = 'create' | 'edit';
export type DODirection = 'IMPORT' | 'EXPORT';
export type DOKind = 'DO' | 'SDO';

export interface DOFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface DOConfirmDetail {
  label: string;
  value: ReactNode;
}

export interface DOConfirmItem {
  key: string;
  primary: ReactNode;
  secondary?: ReactNode;
}

interface DOSaveConfirmModalProps {
  open: boolean;
  action: DOConfirmAction;
  direction: DODirection;
  /** Direction before the edit; shown as a highlighted switch when it differs. */
  previousDirection?: DODirection;
  doType: DOKind;
  previousDoType?: DOKind;
  /** Number of DOs covered (bulk). Defaults to 1. */
  count?: number;
  /** Pending placeholder (PG/PR) edit. */
  isPending?: boolean;
  title?: string;
  subtitle?: ReactNode;
  details?: DOConfirmDetail[];
  changes?: DOFieldChange[];
  items?: DOConfirmItem[];
  itemsLabel?: string;
  warnings?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DO_FIELD_LABELS: Record<string, string> = {
  doNumber: 'DO No',
  doType: 'DO / SDO',
  importOrExport: 'Import / Export',
  date: 'Date',
  truckNo: 'Truck',
  trailerNo: 'Trailer',
  driverName: 'Driver',
  clientName: 'Client',
  haulier: 'Haulier',
  loadingPoint: 'Loading point',
  destination: 'Destination',
  tonnages: 'Tonnage',
  ratePerTon: 'Rate',
  rateType: 'Rate type',
  totalAmount: 'Total',
  containerNo: 'Container',
  invoiceNos: 'Invoice No(s)',
  cargoType: 'Cargo type',
  borderEntryDRC: 'Border entry (DRC)',
};

const RATE_TYPE_LABELS: Record<string, string> = {
  per_ton: 'Per ton',
  fixed_total: 'Fixed total',
};

export function formatDOValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'rateType') return RATE_TYPE_LABELS[String(value)] || String(value);
  if (field === 'date') return String(value).split('T')[0];
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
}

const comparable = (field: string, value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).join(',');
  if (field === 'date') return String(value).split('T')[0];
  return String(value).trim();
};

/** Field-level diff for an edit. Fields missing from `next` are treated as unchanged. */
export function buildDOFieldChanges(
  original: Record<string, any>,
  next: Record<string, any>,
  fields: readonly string[] = Object.keys(DO_FIELD_LABELS)
): DOFieldChange[] {
  const changes: DOFieldChange[] = [];
  for (const field of fields) {
    if (next[field] === undefined) continue;
    if (comparable(field, original[field]) === comparable(field, next[field])) continue;
    changes.push({
      field,
      label: DO_FIELD_LABELS[field] || field,
      from: formatDOValue(field, original[field]),
      to: formatDOValue(field, next[field]),
    });
  }
  return changes;
}

const ACTION_STYLES: Record<DOConfirmAction, { icon: string; iconColor: string; btn: string }> = {
  create: {
    icon: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    btn: 'bg-green-600 hover:bg-green-700',
  },
  edit: {
    icon: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    btn: 'bg-indigo-600 hover:bg-indigo-700',
  },
};

/** "OLD → NEW" when an edit switches the value, otherwise just the value. */
function SwitchText({ from, to }: { from?: string; to: string }) {
  if (!from || from === to) return <>{to}</>;
  return (
    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
      <span className="line-through opacity-60">{from}</span>
      <ArrowRight className="w-3.5 h-3.5" aria-label="changes to" />
      {to}
    </span>
  );
}

export default function DOSaveConfirmModal({
  open,
  action,
  direction,
  previousDirection,
  doType,
  previousDoType,
  count = 1,
  isPending = false,
  title,
  subtitle,
  details = [],
  changes,
  items = [],
  itemsLabel,
  warnings = [],
  confirmLabel,
  cancelLabel = 'Go back',
  loading = false,
  onConfirm,
  onCancel,
}: DOSaveConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const styles = ACTION_STYLES[action];
  const isBulk = count > 1;
  const kindLabel = `${doType}${isBulk ? 's' : ''}`;
  const directionSwitched = action === 'edit' && !!previousDirection && previousDirection !== direction;
  const typeSwitched = action === 'edit' && !!previousDoType && previousDoType !== doType;
  const heading =
    title ||
    (action === 'create'
      ? `Create ${isBulk ? `${count} new ${kindLabel}` : `new ${doType}`}?`
      : `Save changes to ${isBulk ? `${count} ${kindLabel}` : `this ${doType}`}?`);
  const Icon = action === 'create' ? FilePlus : FileEdit;
  const infoRows: DOConfirmDetail[] = [
    {
      label: 'Action',
      value: `${action === 'create' ? 'New' : 'Edit'}${isBulk ? ` · ${count} ${kindLabel}` : ''}`,
    },
    {
      label: 'Import / Export',
      value: (
        <strong className="font-bold">
          <SwitchText from={directionSwitched ? previousDirection : undefined} to={direction} />
        </strong>
      ),
    },
    {
      label: 'Type',
      value: (
        <>
          <SwitchText from={typeSwitched ? previousDoType : undefined} to={doType} />
          {isPending && ' · Pending'}
        </>
      ),
    },
    ...details,
  ];
  const handleCancel = () => {
    if (!loading) onCancel();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />

      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="do-save-confirm-title"
      >
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pb-4 shrink-0">
          <div className="flex items-center gap-4 pr-6">
            <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${styles.icon}`}>
              <Icon className={`w-5 h-5 ${styles.iconColor}`} />
            </div>
            <div className="min-w-0">
              <h2 id="do-save-confirm-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {heading}
              </h2>
              {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
        </div>

        <div className="px-6 overflow-y-auto min-h-0 space-y-4">
          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className="flex gap-2 text-sm text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="whitespace-pre-line">{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {infoRows.length > 0 && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
              {infoRows.map((d) => (
                <div key={d.label} className="min-w-0">
                  <dt className="text-xs text-gray-500 dark:text-gray-400">{d.label}</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {changes && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40 text-xs font-medium text-gray-500 dark:text-gray-400">
                {changes.length > 0 ? `Changes (${changes.length})` : 'Changes'}
              </div>
              {changes.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No field changes detected.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {changes.map((c) => (
                      <tr
                        key={c.field}
                        className={c.field === 'importOrExport' || c.field === 'doType' ? 'bg-amber-50/70 dark:bg-amber-900/10' : ''}
                      >
                        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap align-top">{c.label}</td>
                        <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 line-through break-words">{c.from}</td>
                        <td className="px-1 py-1.5 align-top">
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                        </td>
                        <td className="px-2 py-1.5 font-medium text-gray-900 dark:text-gray-100 break-words">{c.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {items.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40 text-xs font-medium text-gray-500 dark:text-gray-400">
                {itemsLabel || `${kindLabel}`} ({items.length})
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/80">
                {items.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{item.primary}</span>
                    {item.secondary && (
                      <span className="text-gray-500 dark:text-gray-400 truncate">{item.secondary}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={loading}
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2 ${styles.btn}`}
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {confirmLabel ||
              (action === 'create'
                ? `Yes, create ${isBulk ? `${count} ${kindLabel}` : doType}`
                : `Yes, save ${isBulk ? `${count} ${kindLabel}` : 'changes'}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
