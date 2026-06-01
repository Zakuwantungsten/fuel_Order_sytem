import { useState, useEffect, useCallback, useMemo } from 'react';
import { Route, Check, Save, RotateCcw, Loader2, Info, Flag, Fuel } from 'lucide-react';
import { toast } from 'react-toastify';
import { configAPI, JourneyConfig as JourneyConfigData } from '../services/api';
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
    </div>
  );
}
