import { useState } from 'react';
import { Settings, Search, LayoutDashboard, CheckCircle, Info } from 'lucide-react';
import { useOfficerConfig } from '../hooks/useOfficerConfig';
import { useAuth } from '../contexts/AuthContext';

interface OfficerConfigProps {
  user: any;
}

const SEARCH_MONTH_OPTIONS = [
  { value: 1, label: '1 month', description: 'Only current month results' },
  { value: 3, label: '3 months', description: 'Last quarter of data' },
  { value: 6, label: '6 months', description: 'Last half-year (recommended)' },
  { value: 12, label: '12 months', description: 'Full year of results' },
  { value: 24, label: '24 months', description: 'Two years of history' },
];

const MAX_RESULT_OPTIONS = [
  { value: 10, label: '10 results', description: 'Quick overview' },
  { value: 20, label: '20 results', description: 'Standard view' },
  { value: 50, label: '50 results', description: 'Detailed search (recommended)' },
  { value: 100, label: '100 results', description: 'Full history' },
  { value: 0, label: 'All results', description: 'No limit — may be slow' },
];

const DEFAULT_TAB_OPTIONS = [
  { value: 'overview', label: 'Overview', description: 'Show the dashboard overview first' },
  { value: 'do', label: 'Delivery Orders', description: 'Go straight to the DO list' },
];

const OfficerConfig = ({ user }: OfficerConfigProps) => {
  const { isDark } = useAuth();
  const { config, saveConfig } = useOfficerConfig(user.role);
  const [saved, setSaved] = useState(false);

  // local draft before saving
  const [draft, setDraft] = useState({ ...config });

  const isExport = user.role === 'export_officer';
  const accentColor = isExport ? '#EA580C' : '#2563EB';

  const handleSave = () => {
    saveConfig(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const hasChanges =
    draft.searchMonths !== config.searchMonths ||
    draft.maxResults !== config.maxResults ||
    draft.defaultTab !== config.defaultTab;

  const card = (children: React.ReactNode) => (
    <div
      className="rounded-xl border p-5"
      style={{
        background: isDark ? '#1E293B' : '#FFFFFF',
        borderColor: isDark ? '#334155' : '#E2E8F0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {children}
    </div>
  );

  const SectionTitle = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) => (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accentColor}18` }}>
        <Icon className="w-5 h-5" style={{ color: accentColor }} />
      </div>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>{title}</h3>
        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{subtitle}</p>
      </div>
    </div>
  );

  const OptionRow = ({
    value,
    selected,
    label,
    description,
    onClick,
  }: {
    value: any;
    selected: boolean;
    label: string;
    description: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left"
      style={{
        background: selected
          ? isDark ? `${accentColor}18` : `${accentColor}0D`
          : isDark ? '#0F172A' : '#F8FAFC',
        borderColor: selected ? accentColor : isDark ? '#334155' : '#E2E8F0',
      }}
    >
      <div
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ borderColor: selected ? accentColor : isDark ? '#475569' : '#CBD5E1' }}
      >
        {selected && (
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: accentColor }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: isDark ? '#E2E8F0' : '#0F172A' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{description}</p>
      </div>
      {selected && <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />}
    </button>
  );

  return (
    <div className="max-w-2xl space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
            Portal Settings
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            Configure how your {isExport ? 'Export' : 'Import'} Officer portal behaves
          </p>
        </div>
        <Settings className="w-6 h-6" style={{ color: '#64748B' }} />
      </div>

      {/* Info banner */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-lg border"
        style={{
          background: isDark ? 'rgba(37,99,235,0.08)' : '#EFF6FF',
          borderColor: isDark ? 'rgba(37,99,235,0.25)' : '#BFDBFE',
        }}
      >
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
        <p className="text-xs text-blue-600 dark:text-blue-400">
          Settings are saved to this browser. They apply immediately after saving.
        </p>
      </div>

      {/* Search Range */}
      {card(
        <>
          <SectionTitle
            icon={Search}
            title="Truck Search Range"
            subtitle="When you type a truck number, how far back should we look for matching DOs?"
          />
          <div className="space-y-2">
            {SEARCH_MONTH_OPTIONS.map(opt => (
              <OptionRow
                key={opt.value}
                value={opt.value}
                selected={draft.searchMonths === opt.value}
                label={opt.label}
                description={opt.description}
                onClick={() => setDraft(d => ({ ...d, searchMonths: opt.value }))}
              />
            ))}
          </div>

          {/* Live preview of what the setting means */}
          <div
            className="mt-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: '#64748B', border: `1px dashed ${isDark ? '#334155' : '#E2E8F0'}` }}
          >
            With <strong style={{ color: isDark ? '#CBD5E1' : '#374151' }}>{draft.searchMonths} month{draft.searchMonths !== 1 ? 's' : ''}</strong> selected:
            searching <em>"TRK-001"</em> will show every DO for that truck from{' '}
            <strong style={{ color: isDark ? '#CBD5E1' : '#374151' }}>
              {new Date(Date.now() - draft.searchMonths * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </strong>{' '}
            up to today.
          </div>
        </>,
      )}

      {/* Max Results */}
      {card(
        <>
          <SectionTitle
            icon={Search}
            title="Max Search Results"
            subtitle="Maximum number of DO cards shown when searching a truck number"
          />
          <div className="space-y-2">
            {MAX_RESULT_OPTIONS.map(opt => (
              <OptionRow
                key={opt.value}
                value={opt.value}
                selected={draft.maxResults === opt.value}
                label={opt.label}
                description={opt.description}
                onClick={() => setDraft(d => ({ ...d, maxResults: opt.value }))}
              />
            ))}
          </div>
        </>,
      )}

      {/* Default landing tab */}
      {card(
        <>
          <SectionTitle
            icon={LayoutDashboard}
            title="Default Landing Tab"
            subtitle="Which tab opens when you log in or refresh the page"
          />
          <div className="space-y-2">
            {DEFAULT_TAB_OPTIONS.map(opt => (
              <OptionRow
                key={opt.value}
                value={opt.value}
                selected={draft.defaultTab === opt.value}
                label={opt.label}
                description={opt.description}
                onClick={() => setDraft(d => ({ ...d, defaultTab: opt.value as 'overview' | 'do' }))}
              />
            ))}
          </div>
        </>,
      )}

      {/* Save button */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
          style={{
            background: hasChanges ? accentColor : isDark ? '#334155' : '#CBD5E1',
            cursor: hasChanges ? 'pointer' : 'not-allowed',
            boxShadow: hasChanges ? `0 4px 12px ${accentColor}40` : 'none',
          }}
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
        {hasChanges && (
          <button
            onClick={() => setDraft({ ...config })}
            className="px-4 py-2.5 rounded-lg text-sm transition-colors"
            style={{ color: '#64748B', background: isDark ? '#1E293B' : '#F8FAFC', border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}` }}
          >
            Discard Changes
          </button>
        )}
        {saved && (
          <p className="text-xs flex items-center gap-1" style={{ color: '#16A34A' }}>
            <CheckCircle className="w-3.5 h-3.5" /> Settings applied
          </p>
        )}
      </div>
    </div>
  );
};

export default OfficerConfig;
