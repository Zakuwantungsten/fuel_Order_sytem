import { useState, useEffect } from 'react';
import {
  Megaphone, FileUp, RefreshCw, ArrowRight,
} from 'lucide-react';
import announcementService from '../../services/announcementService';
import AnnouncementsTab from './AnnouncementsTab';
import ExcelImport from '../../pages/ExcelImport';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type View = 'overview' | 'announcements' | 'excel_import';

export default function SystemContentSubTab({ onMessage }: Props) {
  const [view, setView] = useState<View>('overview');
  const [stats, setStats] = useState<{ live: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadOverview(); }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const all = await announcementService.getAll();
      const live = Array.isArray(all) ? all.filter((a: any) => a.isActive).length : 0;
      setStats({ live, total: Array.isArray(all) ? all.length : 0 });
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const views: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'excel_import', label: 'Excel Import' },
  ];

  return (
    <div className="space-y-5">
      {/* Pill nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              view === v.id
                ? 'bg-pink-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}>{v.label}</button>
        ))}
        {view === 'overview' && (
          <button onClick={loadOverview} disabled={loading}
            className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {view === 'overview' && (
        <div className="space-y-5">
          {/* Stats */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-pink-500 animate-spin" />
            </div>
          ) : stats && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Megaphone className="w-5 h-5 text-pink-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.live}<span className="text-base font-normal text-gray-400">/{stats.total}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">Live Announcements</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <FileUp className="w-5 h-5 text-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">3</p>
                <p className="text-xs text-gray-400 mt-1">Import Types Supported</p>
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => setView('announcements')}
              className="flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800">
              <Megaphone className="w-6 h-6 text-pink-600 dark:text-pink-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Announcements</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Create, schedule, and manage system-wide announcements with severity levels and role targeting
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            </button>
            <button onClick={() => setView('excel_import')}
              className="flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <FileUp className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Excel Import</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Import fuel records, delivery orders, and LPO entries from Excel files with preview and dry-run
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            </button>
          </div>
        </div>
      )}

      {view === 'announcements' && <AnnouncementsTab onMessage={onMessage} />}
      {view === 'excel_import' && <ExcelImport />}
    </div>
  );
}
