import { useState, useEffect, useCallback, useMemo, ChangeEvent } from 'react';
import { Route, Check, Save, RotateCcw, Loader2, Info, Flag, Fuel, Clock, Gauge, Pencil, X, FileDown, Workflow, AlertTriangle, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { configAPI, JourneyConfig as JourneyConfigData, StandardAllocations, YardFuelTimeLimitConfig, FuelAutomationConfig } from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

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

  useEffect(() => { load(); }, [load]);

  useRealtimeSync('journey_config', () => { load(); }, 'rt-journey-config');

  const toggle = (col: string) =>
    setSelected((prev) => prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]);

  const isDirty = useMemo(() => {
    if (selected.length !== savedSelected.length) return true;
    const a = [...selected].sort();
    const b = [...savedSelected].sort();
    return a.some((v, i) => v !== b[i]);
  }, [selected, savedSelected]);

  const canSave = isDirty && selected.length > 0 && !saving;

  const handleSave = async () => {
    if (selected.length === 0) { toast.error('Select at least one start column'); return; }
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
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm flex-shrink-0">
          <Route className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Journey Configuration</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Control journey promotion, fuel limits, allocations, and document behaviour.
          </p>
        </div>
      </div>

      {/* Explainer — compact single row */}
      <div className="flex gap-2.5 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-blue-800/90 dark:text-blue-200/80 leading-relaxed">
          <span className="font-semibold">How journeys promote:</span> a truck&apos;s <em>queued</em> journey becomes <em>active</em> the moment any selected <strong>start column</strong> is filled (via LPO or manual entry) — the previous active journey is auto-completed.
        </p>
      </div>

      {/* Masonry: each card flows top-to-bottom down a column, then wraps to the
          next column — fills vertical space first, then horizontal as the viewport
          widens. Cards keep their natural height (no equal-height stretching), so
          short cards no longer leave dead space below them. */}
      <div className="columns-1 lg:columns-2 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {/* Start columns */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <Flag className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
            <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">Start columns</h2>
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {selected.length} / {selectable.length}
            </span>
          </div>

          <div className="p-4 flex-1">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
                ))}
              </div>
            ) : (
              <div role="group" aria-label="Start columns" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {selectable.map((col) => {
                  const active = selected.includes(col);
                  return (
                    <button
                      key={col}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      onClick={() => toggle(col)}
                      className={`group flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800 ${
                        active
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-500'
                          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          active ? 'border-primary-500 bg-primary-600 text-white' : 'border-gray-300 dark:border-gray-500 text-transparent'
                        }`}
                        aria-hidden="true"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-xs font-medium truncate ${active ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-gray-100'}`}>
                          {labelFor(col)}
                        </span>
                        <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">{col}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && selected.length === 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Fuel className="w-3.5 h-3.5" aria-hidden="true" />
                Select at least one — otherwise queued journeys can never start.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setSelected(savedSelected)}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <RotateCcw className="w-3.5 h-3.5" />Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <SuperManagerStationsCard />
        <YardTimeLimitCard />
        <PdfDownloadSettingsCard />
        <CashLpoLookbackCard />
        <SearchConfigCard />
        <FuelAutomationCard />
      </div>

      {/* Standard Allocations — full width (its multi-column number grid needs the room) */}
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
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
        checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ── PDF Download Settings ─────────────────────────────────────────────────────

function PdfDownloadSettingsCard() {
  const [autoDownloadDO, setAutoDownloadDO] = useState(true);
  const [autoDownloadLPO, setAutoDownloadLPO] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cfg = await configAPI.getJourneyConfig();
      setAutoDownloadDO(cfg.autoDownloadDOPdf ?? true);
      setAutoDownloadLPO(cfg.autoDownloadLPOPdf ?? true);
    } catch {
      toast.error('Failed to load PDF settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSync('journey_config', load, 'rt-pdf-settings');

  const toggle = async (field: 'do' | 'lpo', value: boolean) => {
    if (saving) return;
    const prev = field === 'do' ? autoDownloadDO : autoDownloadLPO;
    if (field === 'do') setAutoDownloadDO(value);
    else setAutoDownloadLPO(value);
    setSaving(true);
    try {
      const payload = field === 'do'
        ? { autoDownloadDOPdf: value }
        : { autoDownloadLPOPdf: value };
      const cfg = await configAPI.updatePdfDownloadSettings(payload);
      setAutoDownloadDO(cfg.autoDownloadDOPdf ?? true);
      setAutoDownloadLPO(cfg.autoDownloadLPOPdf ?? true);
      const label = field === 'do' ? 'DO PDF' : 'LPO PDF';
      toast.success(`${label} auto-download ${value ? 'enabled' : 'disabled'}`);
    } catch {
      if (field === 'do') setAutoDownloadDO(prev);
      else setAutoDownloadLPO(prev);
      toast.error('Failed to update PDF settings');
    } finally {
      setSaving(false);
    }
  };

  const rows: { label: string; sub: string; field: 'do' | 'lpo'; value: boolean }[] = [
    {
      label: 'Auto-download DO PDF',
      sub: 'Downloads PDF immediately after creating a single or bulk delivery order.',
      field: 'do',
      value: autoDownloadDO,
    },
    {
      label: 'Auto-download LPO PDF',
      sub: 'Downloads PDF after "Create and Forward" in the LPO form.',
      field: 'lpo',
      value: autoDownloadLPO,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <FileDown className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">PDF auto-download</h2>
      </div>

      <div className="px-4 py-3 space-y-1">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Toggle whether PDFs are downloaded automatically on document creation. Users can still download manually from the list at any time.
        </p>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ label, sub, field, value }) => (
              <div
                key={field}
                className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  value
                    ? 'border-primary-200 dark:border-primary-800/60 bg-primary-50/50 dark:bg-primary-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${value ? 'text-primary-900 dark:text-primary-100' : 'text-gray-700 dark:text-gray-300'}`}>
                    {label}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{sub}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                  <span className={`text-[10px] font-semibold ${value ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {value ? 'ON' : 'OFF'}
                  </span>
                  <Switch
                    checked={value}
                    onChange={(v) => toggle(field, v)}
                    disabled={saving}
                    label={label}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Yard Fuel Dispense Time Limit ────────────────────────────────────────────

const YARD_TIME_LIMITS: { key: keyof YardFuelTimeLimitConfig['perYard']; label: string }[] = [
  { key: 'darYard',   label: 'Dar Yard'   },
  { key: 'tangaYard', label: 'Tanga Yard' },
  { key: 'mmsaYard',  label: 'MSA Yard'   },
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

  const setDaysLocal = (key: keyof YardFuelTimeLimitConfig['perYard'], days: number) =>
    setTimeLimit(prev => ({
      ...prev,
      perYard: { ...prev.perYard, [key]: { ...prev.perYard[key], timeLimitDays: days } },
    }));

  const saveDays = (key: keyof YardFuelTimeLimitConfig['perYard'], label: string) => {
    const days = timeLimit.perYard[key]?.timeLimitDays ?? 2;
    if (days < 0.5 || days > 30) { toast.error('Time limit must be between 0.5 and 30 days'); return; }
    persist({ perYard: timeLimit.perYard }, `${label} window set to ${days} ${days === 1 ? 'day' : 'days'}`);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <Clock className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">Yard fuel time limit</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold ${timeLimit.enabled ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {timeLimit.enabled ? 'ON' : 'OFF'}
          </span>
          <Switch checked={timeLimit.enabled} onChange={toggleGlobal} disabled={saving || loading} label="Enable yard fuel time limit" />
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Restrict yard fuel dispensing to trucks with a fuel record created within the configured window, preventing stale records.
        </p>

        <div className="space-y-2">
          {YARD_TIME_LIMITS.map(({ key, label }) => {
            const yard = timeLimit.perYard[key];
            const active = !!yard?.enabled && timeLimit.enabled;
            return (
              <div
                key={key}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  active
                    ? 'border-primary-300 dark:border-primary-700 bg-primary-50/60 dark:bg-primary-900/15'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
                } ${!timeLimit.enabled ? 'opacity-60' : ''}`}
              >
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 w-24 flex-shrink-0">{label}</span>
                <div className="flex items-center gap-1.5 flex-1">
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
                    className="w-14 px-2 py-1 text-xs tabular-nums text-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">days</span>
                </div>
                <Switch
                  checked={!!yard?.enabled}
                  onChange={(v) => toggleYard(key, label, v)}
                  disabled={!timeLimit.enabled || saving}
                  label={`Enable ${label} time limit`}
                />
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Toggle a yard off to remove its restriction even when the global limit is on. Day-window changes save on field blur.
        </p>
      </div>
    </div>
  );
}

// ── Standard Fuel Allocations ────────────────────────────────────────────────

const ALLOCATION_GROUPS: { title: string; fields: { key: keyof StandardAllocations; label: string }[] }[] = [
  {
    title: 'Yard',
    fields: [
      { key: 'mmsaYard',        label: 'MMSA Yard' },
      { key: 'tangaYardToDar',  label: 'Tanga Yard' },
      { key: 'darYardStandard', label: 'Dar Yard (Std)' },
      { key: 'darYardKisarawe', label: 'Dar Yard (Kis)' },
    ],
  },
  {
    title: 'Going (outbound)',
    fields: [
      { key: 'darGoing',    label: 'Dar' },
      { key: 'moroGoing',   label: 'Moro' },
      { key: 'mbeyaGoing',  label: 'Mbeya' },
      { key: 'tdmGoing',    label: 'Tunduma' },
      { key: 'zambiaGoing', label: 'Zambia' },
      { key: 'congoFuel',   label: 'Congo' },
    ],
  },
  {
    title: 'Return (inbound)',
    fields: [
      { key: 'zambiaReturn',         label: 'Zambia' },
      { key: 'tundumaReturn',        label: 'Tunduma' },
      { key: 'mbeyaReturn',          label: 'Mbeya' },
      { key: 'moroReturnToMombasa',  label: 'Moro' },
      { key: 'darReturn',            label: 'Dar' },
      { key: 'tangaReturnToMombasa', label: 'Tanga' },
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

  const ghostBtn = 'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400';
  const primaryBtn = 'inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <Gauge className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">Standard fuel allocations</h2>
        <div className="ml-auto flex items-center gap-1.5">
          {isEditing ? (
            <>
              <button type="button" onClick={reset} disabled={saving} className={ghostBtn}>
                <RotateCcw className="w-3 h-3" />Reset
              </button>
              <button type="button" onClick={cancel} disabled={saving} className={ghostBtn}>
                <X className="w-3 h-3" />Cancel
              </button>
              <button type="button" onClick={save} disabled={saving} className={primaryBtn}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button type="button" onClick={beginEdit} disabled={loading || !allocations} className={ghostBtn}>
              <Pencil className="w-3 h-3" />Edit
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Expected fuel at each checkpoint. Fuel records exceeding these thresholds get a caution flag.
        </p>

        {loading && !data ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No allocations configured.</p>
        ) : (
          <div className="space-y-4">
            {ALLOCATION_GROUPS.map(group => (
              <div key={group.title}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group.title}</span>
                  <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {group.fields.map(({ key, label }) => (
                    <div key={key} className="flex flex-col gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-2.5 py-2">
                      <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 truncate" title={label}>{label}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={data[key]}
                            onChange={(e) => setEditing(prev => prev ? { ...prev, [key]: parseFloat(e.target.value) || 0 } : prev)}
                            aria-label={`${label} standard liters`}
                            className="w-full px-1.5 py-0.5 text-xs tabular-nums text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          <span className="text-[10px] text-gray-400">L</span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {data[key]}<span className="text-[10px] font-medium text-gray-400 ml-0.5">L</span>
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

// ── Fuel Record Automation ───────────────────────────────────────────────────

const FUEL_AUTOMATION_DEFAULTS: FuelAutomationConfig = {
  lpoCreateDeduct: true,
  lpoCancelRevert: true,
  lpoEditAdjust: true,
  lpoPickupAuto: true,
  doImportCreate: true,
  doExportUpdate: true,
  doAmendCascade: true,
  doCancelCascade: true,
};

const FUEL_AUTOMATION_GROUPS: {
  title: string;
  rows: { key: keyof FuelAutomationConfig; label: string; sub: string }[];
}[] = [
  {
    title: 'LPO → Fuel record',
    rows: [
      { key: 'lpoCreateDeduct', label: 'Deduct on LPO creation', sub: "Creating an LPO entry deducts fuel from the truck's balance." },
      { key: 'lpoCancelRevert', label: 'Revert on LPO cancellation', sub: "Cancelling an LPO entry restores the deducted fuel to the truck's balance." },
      { key: 'lpoEditAdjust', label: 'Adjust on LPO edit', sub: "Editing an LPO entry's liters or truck recalculates the fuel deduction." },
      { key: 'lpoPickupAuto', label: 'Auto checkpoints on pick-up-at', sub: 'Pick-up-at auto-detects the revert/add checkpoints. Turn OFF to pick them per truck (e.g. raw imported records).' },
    ],
  },
  {
    title: 'DO → Fuel record',
    rows: [
      { key: 'doImportCreate', label: 'Create on import DO', sub: 'An IMPORT delivery order creates a new going-journey fuel record.' },
      { key: 'doExportUpdate', label: 'Update on export DO', sub: "An EXPORT delivery order fills the matched going record's return leg." },
      { key: 'doAmendCascade', label: 'Cascade DO amendments', sub: 'Truck / destination / loading-point edits recalculate the linked fuel record.' },
      { key: 'doCancelCascade', label: 'Cascade DO cancellation', sub: 'Cancelling a DO cancels or reverts its linked fuel record.' },
    ],
  },
];

// ── Cash LPO Lookback Window ─────────────────────────────────────────────────

function CashLpoLookbackCard() {
  const [days, setDays] = useState(40);
  const [draft, setDraft] = useState('40');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cfg = await configAPI.getJourneyConfig();
      const v = cfg.cashLpoLookbackDays ?? 40;
      setDays(v);
      setDraft(String(v));
    } catch {
      toast.error('Failed to load cash LPO lookback setting');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSync('journey_config', load, 'rt-cash-lpo-lookback');

  const save = async () => {
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 365) {
      toast.warn('Enter a value between 1 and 365 days');
      return;
    }
    if (parsed === days) return;
    setSaving(true);
    try {
      const cfg = await configAPI.updateCashLpoLookbackDays(parsed);
      const v = cfg.cashLpoLookbackDays ?? parsed;
      setDays(v);
      setDraft(String(v));
      toast.success(`Cash LPO lookback window updated to ${v} days`);
    } catch {
      toast.error('Failed to update lookback setting');
    } finally {
      setSaving(false);
    }
  };

  const dirty = parseInt(draft, 10) !== days;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <Clock className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">Cash LPO lookback window</h2>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          When creating a CASH LPO, the system looks back this many days to find existing LPO allocations for
          each truck at the selected checkpoint. Increase this if trucks take longer than 40 days to complete
          a journey.
        </p>
        {loading ? (
          <div className="h-10 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-[180px]">
              <input
                type="number"
                min={1}
                max={365}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={saving}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">days</span>
            </div>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FuelAutomationCard() {
  const [flags, setFlags] = useState<FuelAutomationConfig>(FUEL_AUTOMATION_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof FuelAutomationConfig | null>(null);

  const load = useCallback(async () => {
    try {
      const cfg = await configAPI.getJourneyConfig();
      setFlags({ ...FUEL_AUTOMATION_DEFAULTS, ...(cfg.fuelAutomation || {}) });
    } catch {
      toast.error('Failed to load fuel automation settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSync('journey_config', load, 'rt-fuel-automation');

  const toggle = async (key: keyof FuelAutomationConfig, value: boolean) => {
    if (savingKey) return;
    const prev = flags[key];
    setFlags((f) => ({ ...f, [key]: value }));
    setSavingKey(key);
    try {
      const cfg = await configAPI.updateFuelAutomation({ [key]: value });
      if (cfg.fuelAutomation) setFlags({ ...FUEL_AUTOMATION_DEFAULTS, ...cfg.fuelAutomation });
      toast.success(`${value ? 'Enabled' : 'Disabled'} — ${String(key)}`);
    } catch {
      setFlags((f) => ({ ...f, [key]: prev }));
      toast.error('Failed to update fuel automation');
    } finally {
      setSavingKey(null);
    }
  };

  const anyOff = (Object.keys(FUEL_AUTOMATION_DEFAULTS) as (keyof FuelAutomationConfig)[]).some((k) => !flags[k]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <Workflow className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">Fuel record automation</h2>
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Control the automatic fuel-record side-effects of LPO and DO operations. Turn one off to manage that part of fuel records manually. The originating LPO/DO still saves; only the fuel-record change is skipped (and logged to the audit trail).
        </p>

        {anyOff && !loading && (
          <div className="flex gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
              One or more automations are off. While off, fuel records are <strong>not</strong> kept in sync and changes are <strong>not</strong> replayed when you turn them back on — reconcile affected fuel records manually.
            </p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {FUEL_AUTOMATION_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group.title}</span>
                  <span className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">
                  {group.rows.map(({ key, label, sub }) => {
                    const value = flags[key];
                    return (
                      <div
                        key={key}
                        className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                          value
                            ? 'border-primary-200 dark:border-primary-800/60 bg-primary-50/50 dark:bg-primary-900/10'
                            : 'border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-900/10'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${value ? 'text-primary-900 dark:text-primary-100' : 'text-amber-900 dark:text-amber-200'}`}>{label}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{sub}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                          <span className={`text-[10px] font-semibold ${value ? 'text-primary-600 dark:text-primary-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {value ? 'ON' : 'OFF'}
                          </span>
                          <Switch checked={value} onChange={(v) => toggle(key, v)} disabled={savingKey !== null} label={label} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Super Manager Station Access ─────────────────────────────────────────────

function SuperManagerStationsCard() {
  const [stations, setStations] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  // LPO lookback window (days) for ALL manager-tier roles. '0' / '' => unlimited.
  const [lookback, setLookback] = useState('0');
  const [savedLookback, setSavedLookback] = useState('0');
  const [notifyCustomZambia, setNotifyCustomZambia] = useState(true);
  const [savedNotifyCustomZambia, setSavedNotifyCustomZambia] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfg, stationDocs] = await Promise.all([
        configAPI.getJourneyConfig(),
        configAPI.getStations(),
      ]);
      const names: string[] = (stationDocs || [])
        .map((s: any) => s.stationName || s.name)
        .filter(Boolean);
      setStations(Array.from(new Set(names)).sort());
      const sm = cfg.superManagerStations || [];
      setSelected(sm);
      setSaved(sm);
      const lb = String(cfg.managerLpoLookbackDays ?? 0);
      setLookback(lb);
      setSavedLookback(lb);
      const notifyZ = cfg.superManagerNotifyCustomZambia !== false;
      setNotifyCustomZambia(notifyZ);
      setSavedNotifyCustomZambia(notifyZ);
    } catch {
      toast.error('Failed to load super-manager station access');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSync('journey_config', () => { load(); }, 'rt-sm-stations');

  const toggle = (s: string) =>
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Normalize the lookback input to a clamped integer (0..3650). '' => 0.
  const normalizedLookback = useMemo(() => {
    const n = parseInt(lookback, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 3650);
  }, [lookback]);

  const stationsDirty = useMemo(() => {
    if (selected.length !== saved.length) return true;
    const a = [...selected].sort();
    const b = [...saved].sort();
    return a.some((v, i) => v !== b[i]);
  }, [selected, saved]);

  const isDirty = stationsDirty || normalizedLookback !== parseInt(savedLookback, 10) || notifyCustomZambia !== savedNotifyCustomZambia;

  const handleSave = async () => {
    setSaving(true);
    try {
      let cfg = await configAPI.updateSuperManagerStations(selected);
      if (notifyCustomZambia !== savedNotifyCustomZambia) {
        cfg = await configAPI.updateSuperManagerNotifyCustomZambia(notifyCustomZambia);
      }
      if (normalizedLookback !== parseInt(savedLookback, 10)) {
        cfg = await configAPI.updateManagerLpoLookbackDays(normalizedLookback);
      }
      const sm = cfg.superManagerStations || [];
      setSelected(sm);
      setSaved(sm);
      const lb = String(cfg.managerLpoLookbackDays ?? normalizedLookback);
      setLookback(lb);
      setSavedLookback(lb);
      const notifyZ = cfg.superManagerNotifyCustomZambia !== false;
      setNotifyCustomZambia(notifyZ);
      setSavedNotifyCustomZambia(notifyZ);
      toast.success('Manager access settings saved');
    } catch {
      toast.error('Failed to save manager access settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <Fuel className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">Super Manager stations</h2>
        <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
          {selected.length === 0 ? 'All' : `${selected.length}`}
        </span>
      </div>

      <div className="px-4 py-3 flex-1 flex flex-col gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Which stations a <strong>super manager</strong> can view in the mobile app. Leave all unchecked to allow <strong>all stations</strong>.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : stations.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">No stations configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 flex-1">
            {stations.map((s) => {
              const checked = selected.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                    checked
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300'
                  }`}
                  aria-pressed={checked}
                >
                  <span
                    className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-primary-500 bg-primary-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {checked ? <Check className="w-2.5 h-2.5 text-white" /> : null}
                  </span>
                  <span className="truncate" title={s}>{s}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Custom Zambia station notifications */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Notify for custom Zambia stations
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Super manager receives LPO notifications when an unlisted custom station in <strong>Zambia</strong> is used. The entered station name appears in the notification.
              </p>
            </div>
            <Switch
              checked={notifyCustomZambia}
              onChange={setNotifyCustomZambia}
              disabled={loading || saving}
              label="Notify super manager for custom Zambia station LPOs"
            />
          </div>
        </div>

        {/* LPO date-range (lookback) window for manager-tier roles */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <label htmlFor="manager-lpo-lookback" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            LPO history window for managers
          </label>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 mb-1.5">
            How many days back <strong>managers &amp; super managers</strong> can see LPOs (web &amp; mobile). Use <strong>0</strong> for unlimited. Enforced on the server.
          </p>
          <div className="flex items-center gap-2">
            <input
              id="manager-lpo-lookback"
              type="number"
              min={0}
              max={3650}
              value={lookback}
              onChange={(e) => setLookback(e.target.value)}
              className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {normalizedLookback === 0 ? 'days (unlimited)' : `days (~${(normalizedLookback / 30).toFixed(normalizedLookback % 30 === 0 ? 0 : 1)} months)`}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => { setSelected(saved); setLookback(savedLookback); setNotifyCustomZambia(savedNotifyCustomZambia); }}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-600 hover:bg-primary-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Search Configuration ──────────────────────────────────────────

const SEARCH_CONFIG_DEFAULTS = {
  doMonths: 4,
  doMaxResults: 6,
  lpoMonths: 1,
  lpoMaxResults: 50,
  fuelMaxResults: 3,
};

type SearchConfigDraft = {
  doMonths: string;
  doMaxResults: string;
  lpoMonths: string;
  lpoMaxResults: string;
  fuelMaxResults: string;
};

function SearchConfigCard() {
  const [saved, setSaved] = useState(SEARCH_CONFIG_DEFAULTS);
  const [draft, setDraft] = useState<SearchConfigDraft>({
    doMonths: String(SEARCH_CONFIG_DEFAULTS.doMonths),
    doMaxResults: String(SEARCH_CONFIG_DEFAULTS.doMaxResults),
    lpoMonths: String(SEARCH_CONFIG_DEFAULTS.lpoMonths),
    lpoMaxResults: String(SEARCH_CONFIG_DEFAULTS.lpoMaxResults),
    fuelMaxResults: String(SEARCH_CONFIG_DEFAULTS.fuelMaxResults),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cfg = await configAPI.getJourneyConfig();
      const sc = { ...SEARCH_CONFIG_DEFAULTS, ...cfg.searchConfig };
      setSaved(sc);
      setDraft({
        doMonths: String(sc.doMonths),
        doMaxResults: String(sc.doMaxResults),
        lpoMonths: String(sc.lpoMonths),
        lpoMaxResults: String(sc.lpoMaxResults),
        fuelMaxResults: String(sc.fuelMaxResults),
      });
    } catch {
      toast.error('Failed to load search configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSync('journey_config', load, 'rt-search-config');

  const set = (key: keyof SearchConfigDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  const isDirty = (Object.keys(draft) as (keyof SearchConfigDraft)[]).some(
    (k) => parseInt(draft[k], 10) !== saved[k]
  );

  const handleSave = async () => {
    const parsed = {
      doMonths: parseInt(draft.doMonths, 10),
      doMaxResults: parseInt(draft.doMaxResults, 10),
      lpoMonths: parseInt(draft.lpoMonths, 10),
      lpoMaxResults: parseInt(draft.lpoMaxResults, 10),
      fuelMaxResults: parseInt(draft.fuelMaxResults, 10),
    };
    const limits: Record<keyof typeof parsed, [number, number]> = {
      doMonths: [1, 24],
      doMaxResults: [1, 100],
      lpoMonths: [1, 24],
      lpoMaxResults: [1, 500],
      fuelMaxResults: [1, 100],
    };
    for (const [key, [min, max]] of Object.entries(limits) as [keyof typeof parsed, [number, number]][]) {
      if (isNaN(parsed[key]) || parsed[key] < min || parsed[key] > max) {
        toast.warn(`${key} must be between ${min} and ${max}`);
        return;
      }
    }
    setSaving(true);
    try {
      const cfg = await configAPI.updateSearchConfig(parsed);
      const sc = { ...SEARCH_CONFIG_DEFAULTS, ...cfg.searchConfig };
      setSaved(sc);
      setDraft({
        doMonths: String(sc.doMonths),
        doMaxResults: String(sc.doMaxResults),
        lpoMonths: String(sc.lpoMonths),
        lpoMaxResults: String(sc.lpoMaxResults),
        fuelMaxResults: String(sc.fuelMaxResults),
      });
      toast.success('Search configuration saved');
    } catch {
      toast.error('Failed to save search configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () =>
    setDraft({
      doMonths: String(saved.doMonths),
      doMaxResults: String(saved.doMaxResults),
      lpoMonths: String(saved.lpoMonths),
      lpoMaxResults: String(saved.lpoMaxResults),
      fuelMaxResults: String(saved.fuelMaxResults),
    });

  const rows: { key: keyof SearchConfigDraft; label: string; unit: string; min: number; max: number; sub: string }[] = [
    { key: 'doMonths', label: 'DO date range', unit: 'months', min: 1, max: 24, sub: 'How many months back to search delivery orders' },
    { key: 'doMaxResults', label: 'DO max results', unit: 'results', min: 1, max: 100, sub: 'Maximum delivery orders returned per search' },
    { key: 'lpoMonths', label: 'LPO date range', unit: 'months', min: 1, max: 24, sub: 'How many months back to search LPO entries' },
    { key: 'lpoMaxResults', label: 'LPO max results', unit: 'results', min: 1, max: 500, sub: 'Maximum LPO entries returned per search' },
    { key: 'fuelMaxResults', label: 'Fuel record max results', unit: 'results', min: 1, max: 100, sub: 'Maximum fuel records returned per search (no date filter)' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <Search className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">Dashboard search limits</h2>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Controls how far back and how many results the unified search bar on the dashboard returns for each record type.
        </p>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ key, label, unit, min, max, sub }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{label}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{sub}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={draft[key]}
                    onChange={set(key)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    disabled={saving}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-12 shrink-0">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {!loading && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
