import { useState, useEffect, useCallback, useMemo } from 'react';
import { Route, Check, Save, RotateCcw, Loader2, Info, Flag, Fuel, Clock, Gauge, Pencil, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { configAPI, JourneyConfig as JourneyConfigData, StandardAllocations, YardFuelTimeLimitConfig } from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

/** Human-friendly labels for the fuel-record columns. */
const COLUMN_LABELS: Record<string, string> = {
  mmsaYard: 'MSA Yard',
  tangaYard: 'Tanga Yard',
  darYard: 'Dar Yard',
  darGoing: 'Dar Going',
  moroGoing: 'Morogoro Going',
  mbeyaGoing: 'Mbeya Going',
  tdmGoing: 'Tunduma Going',
  zambiaGoing: 'Zambia Going',
  congoFuel: 'Congo Fuel',
};

const labelFor = (key: string) => COLUMN_LABELS[key] || key;

export default function JourneyConfig() {
  const [selectable, setSelectable] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [savedSelected, setSavedSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyConfig = useCallback((cfg: JourneyConfigData) => {
    const select = cfg.selectableColumns && cfg.selectableColumns.length > 0
      ? cfg.selectableColumns
      : cfg.startColumns;
    setSelectable(select);
    setSelected(cfg.startColumns);
    setSavedSelected(cfg.startColumns);
  }, []);

  const load = useCallback(async () => {
    try {
      const cfg = await configAPI.getJourneyConfig();
      applyConfig(cfg);
    } catch {
      toast.error('Failed to load journey configuration');
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: if another admin changes the config, reflect it here without a refresh.
  useRealtimeSync('journey_config', () => {
    load();
  }, 'rt-journey-config');

  const toggle = (col: string) => {
    setSelected((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const isDirty = useMemo(() => {
    if (selected.length !== savedSelected.length) return true;
    const a = [...selected].sort();
    const b = [...savedSelected].sort();
    return a.some((v, i) => v !== b[i]);
  }, [selected, savedSelected]);

  const canSave = isDirty && selected.length > 0 && !saving;

  const handleSave = async () => {
    if (selected.length === 0) {
      toast.error('Select at least one start column');
      return;
    }
    setSaving(true);
    try {
      const cfg = await configAPI.updateJourneyConfig(selected);
      applyConfig(cfg);
      toast.success('Journey configuration saved');
    } catch {
      toast.error('Failed to save journey configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm flex-shrink-0">
          <Route className="w-6 h-6 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Journey Configuration
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Choose which fuel columns signal that a truck has started a new journey.
          </p>
        </div>
      </div>

      {/* Explainer */}
      <div className="flex gap-3 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 p-4">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm text-blue-900 dark:text-blue-200 space-y-1">
          <p className="font-medium">How journey completion works</p>
          <p className="text-blue-800/90 dark:text-blue-200/80">
            A truck has one <strong>active</strong> journey; new ones created meanwhile are
            <strong> queued</strong>. The moment any <strong>start column</strong> below is filled on a
            queued journey — by an LPO or a manual fuel entry — that journey becomes
            <strong> active</strong> and the truck&apos;s previous active journey is marked
            <strong> completed</strong>, regardless of its balance.
          </p>
        </div>
      </div>

      {/* Selector card */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <Flag className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          <h2 className="font-medium text-gray-900 dark:text-gray-100">Start columns</h2>
          <span className="ml-auto text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {selected.length} selected
          </span>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <div
              role="group"
              aria-label="Start columns"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              {selectable.map((col) => {
                const active = selected.includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => toggle(col)}
                    className={`group flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800 ${
                      active
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-500'
                        : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                        active
                          ? 'border-primary-500 bg-primary-600 text-white'
                          : 'border-gray-300 dark:border-gray-500 text-transparent group-hover:border-gray-400'
                      }`}
                      aria-hidden="true"
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${active ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-gray-100'}`}>
                        {labelFor(col)}
                      </span>
                      <span className="block text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                        {col}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && selected.length === 0 && (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <Fuel className="w-4 h-4" aria-hidden="true" />
              Select at least one start column — otherwise queued journeys can never start.
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setSelected(savedSelected)}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Yard fuel dispense time limit */}
      <YardTimeLimitCard />

      {/* Standard fuel allocations */}
      <StandardAllocationsCard />
    </div>
  );
}

// ── Shared switch ────────────────────────────────────────────────────────────

function Switch({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
        checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ── Yard Fuel Dispense Time Limit ────────────────────────────────────────────

const YARD_TIME_LIMITS: { key: keyof YardFuelTimeLimitConfig['perYard']; label: string }[] = [
  { key: 'darYard',   label: 'Dar Yard'   },
  { key: 'tangaYard', label: 'Tanga Yard' },
  { key: 'mmsaYard',  label: 'MMSA Yard'  },
];

function YardTimeLimitCard() {
  const [timeLimit, setTimeLimit] = useState<YardFuelTimeLimitConfig>({
    enabled: false,
    perYard: {
      darYard:   { enabled: true, timeLimitDays: 2 },
      tangaYard: { enabled: true, timeLimitDays: 2 },
      mmsaYard:  { enabled: true, timeLimitDays: 2 },
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cfg = await configAPI.getYardFuelTimeLimit();
      if (cfg) setTimeLimit(cfg);
    } catch {
      toast.error('Failed to load yard time limits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSync('yard_fuel_time_limit', load, 'rt-yard-time-limit');

  const persist = async (patch: Partial<YardFuelTimeLimitConfig>, msg: string) => {
    setSaving(true);
    try {
      const updated = await configAPI.updateYardFuelTimeLimit(patch);
      setTimeLimit(updated);
      toast.success(msg);
    } catch {
      toast.error('Failed to update time limit');
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleGlobal = (v: boolean) =>
    persist({ enabled: v }, `Time limit ${v ? 'enabled' : 'disabled'}`);

  const toggleYard = (key: keyof YardFuelTimeLimitConfig['perYard'], label: string, v: boolean) => {
    const perYard = { ...timeLimit.perYard, [key]: { ...timeLimit.perYard[key], enabled: v } };
    setTimeLimit(prev => ({ ...prev, perYard }));
    persist({ perYard }, `${label} ${v ? 'enabled' : 'disabled'}`);
  };

  const setDaysLocal = (key: keyof YardFuelTimeLimitConfig['perYard'], days: number) => {
    setTimeLimit(prev => ({
      ...prev,
      perYard: { ...prev.perYard, [key]: { ...prev.perYard[key], timeLimitDays: days } },
    }));
  };

  const saveDays = (key: keyof YardFuelTimeLimitConfig['perYard'], label: string) => {
    const days = timeLimit.perYard[key]?.timeLimitDays ?? 2;
    if (days < 0.5 || days > 30) {
      toast.error('Time limit must be between 0.5 and 30 days');
      return;
    }
    persist({ perYard: timeLimit.perYard }, `${label} window set to ${days} ${days === 1 ? 'day' : 'days'}`);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <Clock className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-gray-900 dark:text-gray-100">Yard fuel dispense time limit</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs font-medium ${timeLimit.enabled ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {timeLimit.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch checked={timeLimit.enabled} onChange={toggleGlobal} disabled={saving || loading} label="Enable yard fuel time limit" />
        </div>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          When enabled, yard fuel can only be dispensed for trucks with an active fuel record created within the time window — preventing fuel going to trucks with old / stale records.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {YARD_TIME_LIMITS.map(({ key, label }) => {
            const yard = timeLimit.perYard[key];
            const active = !!yard?.enabled && timeLimit.enabled;
            return (
              <div
                key={key}
                className={`rounded-lg border p-4 transition-colors ${
                  active
                    ? 'border-primary-300 dark:border-primary-700 bg-primary-50/60 dark:bg-primary-900/15'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
                } ${!timeLimit.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
                  <Switch
                    checked={!!yard?.enabled}
                    onChange={(v) => toggleYard(key, label, v)}
                    disabled={!timeLimit.enabled || saving}
                    label={`Enable ${label} time limit`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.5"
                    max="30"
                    step="0.5"
                    value={yard?.timeLimitDays ?? 2}
                    onChange={(e) => setDaysLocal(key, parseFloat(e.target.value) || 2)}
                    onBlur={() => saveDays(key, label)}
                    disabled={!timeLimit.enabled || !yard?.enabled || saving}
                    aria-label={`${label} time limit in days`}
                    className="w-16 px-2 py-1.5 text-sm tabular-nums text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">days</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          Toggle a yard off to remove its restriction even when the global limit is on. Day-window changes save when you leave the field.
        </p>
      </div>
    </div>
  );
}

// ── Standard Fuel Allocations ────────────────────────────────────────────────

const ALLOCATION_GROUPS: { title: string; fields: { key: keyof StandardAllocations; label: string }[] }[] = [
  {
    title: 'Yard allocations',
    fields: [
      { key: 'mmsaYard',        label: 'MMSA Yard' },
      { key: 'tangaYardToDar',  label: 'Tanga Yard' },
      { key: 'darYardStandard', label: 'Dar Yard (Standard)' },
      { key: 'darYardKisarawe', label: 'Dar Yard (Kisarawe)' },
    ],
  },
  {
    title: 'Going (outbound)',
    fields: [
      { key: 'darGoing',    label: 'Dar Going' },
      { key: 'moroGoing',   label: 'Moro Going' },
      { key: 'mbeyaGoing',  label: 'Mbeya Going' },
      { key: 'tdmGoing',    label: 'Tunduma Going' },
      { key: 'zambiaGoing', label: 'Zambia Going' },
      { key: 'congoFuel',   label: 'Congo Fuel' },
    ],
  },
  {
    title: 'Return (inbound)',
    fields: [
      { key: 'zambiaReturn',         label: 'Zambia Return' },
      { key: 'tundumaReturn',        label: 'Tunduma Return' },
      { key: 'mbeyaReturn',          label: 'Mbeya Return' },
      { key: 'moroReturnToMombasa',  label: 'Moro Return' },
      { key: 'darReturn',            label: 'Dar Return' },
      { key: 'tangaReturnToMombasa', label: 'Tanga Return' },
    ],
  },
];

function StandardAllocationsCard() {
  const [allocations, setAllocations] = useState<StandardAllocations | null>(null);
  const [editing, setEditing] = useState<StandardAllocations | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await configAPI.getStandardAllocations();
      setAllocations(data);
      setEditing(prev => (isEditing ? prev : data));
    } catch {
      toast.error('Failed to load standard allocations');
    } finally {
      setLoading(false);
    }
  }, [isEditing]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeSync('standard_allocations', load, 'rt-standard-allocations');

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await configAPI.updateStandardAllocations(editing);
      setAllocations(updated);
      setEditing(updated);
      setIsEditing(false);
      toast.success('Standard allocations updated');
    } catch {
      toast.error('Failed to update allocations');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = () => { setEditing(allocations ? { ...allocations } : null); setIsEditing(true); };
  const cancel = () => { setEditing(allocations ? { ...allocations } : null); setIsEditing(false); };
  const reset = () => setEditing(allocations ? { ...allocations } : null);

  const data = isEditing ? editing : allocations;

  const ghostBtn =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400';
  const primaryBtn =
    'inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <Gauge className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-gray-900 dark:text-gray-100">Standard fuel allocations</h2>
        <div className="ml-auto flex items-center gap-2">
          {isEditing ? (
            <>
              <button type="button" onClick={reset} disabled={saving} className={ghostBtn}>
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />Reset
              </button>
              <button type="button" onClick={cancel} disabled={saving} className={ghostBtn}>
                <X className="w-3.5 h-3.5" aria-hidden="true" />Cancel
              </button>
              <button type="button" onClick={save} disabled={saving} className={primaryBtn}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button type="button" onClick={beginEdit} disabled={loading || !allocations} className={ghostBtn}>
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />Edit
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Expected fuel at each checkpoint. The fuel record table flags a caution icon when a record exceeds these thresholds.
        </p>

        {loading && !data ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No allocations configured.</p>
        ) : (
          <div className="space-y-5">
            {ALLOCATION_GROUPS.map(group => (
              <div key={group.title}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group.title}</span>
                  <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {group.fields.map(({ key, label }) => (
                    <div key={key} className="flex flex-col gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate" title={label}>{label}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            value={data[key]}
                            onChange={(e) => setEditing(prev => prev ? { ...prev, [key]: parseFloat(e.target.value) || 0 } : prev)}
                            aria-label={`${label} standard liters`}
                            className="w-full px-2 py-1 text-sm tabular-nums text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                          <span className="text-xs text-gray-400">L</span>
                        </div>
                      ) : (
                        <span className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {data[key]}<span className="text-xs font-medium text-gray-400 ml-0.5">L</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
