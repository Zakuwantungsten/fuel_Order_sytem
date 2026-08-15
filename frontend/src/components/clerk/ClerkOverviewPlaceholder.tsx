import { LayoutDashboard, Construction } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function ClerkOverviewPlaceholder() {
  const { isDark } = useAuth();

  return (
    <div
      className="rounded-xl border p-8 md:p-12 text-center max-w-2xl mx-auto"
      style={{
        background: isDark ? '#1E293B' : '#FFFFFF',
        borderColor: isDark ? '#334155' : '#E2E8F0',
      }}
    >
      <div
        className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: isDark ? '#0F766E33' : '#CCFBF1' }}
      >
        <LayoutDashboard className="w-7 h-7 text-teal-600" />
      </div>
      <h2 className="text-xl font-bold mb-2" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
        Overview coming next
      </h2>
      <p className="text-sm mb-4" style={{ color: '#64748B' }}>
        Truck search, stats, recents, and shortcuts will live here. Use <strong>Daily Desk</strong> for intake,
        day lists, confirm payouts, and crossed output.
      </p>
      <div
        className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
        style={{
          background: isDark ? '#334155' : '#F1F5F9',
          color: isDark ? '#94A3B8' : '#64748B',
        }}
      >
        <Construction className="w-3.5 h-3.5" />
        Planned for a follow-up pass
      </div>
    </div>
  );
}
