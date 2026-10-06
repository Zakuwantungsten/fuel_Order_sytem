import type { ElementType } from 'react';
import { BarChart3, ChevronRight, Fuel, MoreHorizontal, PackageCheck, Receipt } from 'lucide-react';

export type MobileNavItem = {
  id: string;
  label: string;
  icon: ElementType;
};

const PRIMARY_TABS: MobileNavItem[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'fuel_records', label: 'Fuel', icon: Fuel },
  { id: 'lpo', label: 'LPO', icon: Receipt },
  { id: 'do', label: 'DO', icon: PackageCheck },
];

const PRIMARY_IDS = new Set(PRIMARY_TABS.map((tab) => tab.id));

const MORE_SECTIONS: { label: string; ids: string[]; subtitles: Record<string, string> }[] = [
  {
    label: 'Yards',
    ids: ['tanga_lpo', 'dar_lpo'],
    subtitles: {
      tanga_lpo: 'Tanga yard purchase orders',
      dar_lpo: 'Dar yard purchase orders',
    },
  },
  {
    label: 'Fleet',
    ids: ['truck_batches', 'fleet_tracking', 'checkpoints', 'journey_config'],
    subtitles: {
      truck_batches: 'Truck groups and extra fuel',
      fleet_tracking: 'Where trucks are on the road',
      checkpoints: 'Stops along each route',
      journey_config: 'Timing and journey rules',
    },
  },
  {
    label: 'Administration',
    ids: [
      'admin_users',
      'admin_fuel_stations',
      'admin_fuel_prices',
      'admin_routes',
      'driver_credentials',
      'admin_reports',
      'excel_import',
    ],
    subtitles: {
      admin_users: 'Accounts and user support',
      admin_fuel_stations: 'Stations on the network',
      admin_fuel_prices: 'Current fuel prices',
      admin_routes: 'Destinations and loading points',
      driver_credentials: 'Driver sign-in access',
      admin_reports: 'Admin reports',
      excel_import: 'Import from a spreadsheet',
    },
  },
  {
    label: 'Reports',
    ids: ['reports'],
    subtitles: {
      reports: 'Operational reports',
    },
  },
];

const ACCENT = '#2563EB';
const MUTED = '#64748B';

export function isPrimaryMobileTab(tabId: string) {
  return PRIMARY_IDS.has(tabId);
}

export function MobileBottomNav({
  activeTab,
  moreOpen,
  isDark,
  onSelectPrimary,
  onOpenMore,
}: {
  activeTab: string;
  moreOpen: boolean;
  isDark: boolean;
  onSelectPrimary: (tabId: string) => void;
  onOpenMore: () => void;
}) {
  const moreActive = moreOpen || !PRIMARY_IDS.has(activeTab);

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="Primary"
      className="lg:hidden flex-shrink-0"
      style={{
        background: isDark ? '#0F172A' : '#FFFFFF',
        borderTop: `1px solid ${isDark ? '#1E293B' : '#E2E8F0'}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="grid grid-cols-5">
        {PRIMARY_TABS.map((tab) => {
          const active = !moreOpen && activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectPrimary(tab.id)}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 min-h-[56px] py-2"
              style={{ color: active ? ACCENT : MUTED }}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.25 : 1.75} />
              <span className="text-[11px] leading-none font-medium">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          aria-current={moreActive ? 'page' : undefined}
          className="flex flex-col items-center justify-center gap-1 min-h-[56px] py-2"
          style={{ color: moreActive ? ACCENT : MUTED }}
        >
          <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={moreActive ? 2.25 : 1.75} />
          <span className="text-[11px] leading-none font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}

export function MobileMorePage({
  items,
  activeId,
  isDark,
  onSelect,
}: {
  items: MobileNavItem[];
  activeId: string;
  isDark: boolean;
  onSelect: (tabId: string) => void;
}) {
  const byId = new Map(items.filter((item) => !PRIMARY_IDS.has(item.id)).map((item) => [item.id, item]));
  const used = new Set<string>();

  const sections = MORE_SECTIONS.map((section) => {
    const rows = section.ids
      .map((id) => byId.get(id))
      .filter((item): item is MobileNavItem => !!item);
    rows.forEach((item) => used.add(item.id));
    return { label: section.label, rows, subtitles: section.subtitles };
  }).filter((section) => section.rows.length > 0);

  const leftovers = items.filter((item) => !PRIMARY_IDS.has(item.id) && !used.has(item.id));
  if (leftovers.length > 0) {
    sections.push({ label: 'Other', rows: leftovers, subtitles: {} });
  }

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const pageBg = isDark ? '#0F172A' : '#F1F5F9';
  const titleColor = isDark ? '#F1F5F9' : '#0F172A';
  const divider = isDark ? '#334155' : '#E2E8F0';

  return (
    <div data-testid="mobile-more-page" className="min-h-full px-4 pt-4 pb-8" style={{ background: pageBg }}>
      {sections.map((section) => (
        <section key={section.label} className="mb-5">
          <h3
            className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: '#94A3B8' }}
          >
            {section.label}
          </h3>
          <div className="rounded-2xl overflow-hidden" style={{ background: cardBg }}>
            {section.rows.map((item, index) => {
              const Icon = item.icon;
              const selected = item.id === activeId;
              const subtitle = section.subtitles[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  style={{
                    borderTop: index === 0 ? undefined : `1px solid ${divider}`,
                    background: selected ? (isDark ? 'rgba(37,99,235,0.16)' : '#EFF6FF') : 'transparent',
                  }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" style={{ color: ACCENT }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold truncate" style={{ color: titleColor }}>
                      {item.label}
                    </span>
                    {subtitle && (
                      <span className="block text-xs truncate mt-0.5" style={{ color: '#94A3B8' }}>
                        {subtitle}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#CBD5E1' }} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
