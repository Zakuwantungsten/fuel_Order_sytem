import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import apiClient from '../../services/api';

interface IndexDef {
  name: string;
  key: Record<string, number | string>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
}

interface CollectionInfo {
  collection: string;
  documentCount: number;
  indexes: IndexDef[];
}

export const DbIndexExplorerTab: React.FC = () => {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-admin/db-indexes');
      setCollections(Array.isArray(res.data.data?.collections) ? res.data.data.collections : []);
    } catch {
      setError('Failed to load index information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggle = (name: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const filtered = collections.filter((c) => c.collection.toLowerCase().includes(search.toLowerCase()));

  const totalIndexes = collections.reduce((acc, c) => acc + c.indexes.length, 0);
  const totalDocs = collections.reduce((acc, c) => acc + c.documentCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Database Index Explorer</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">View all MongoDB collection indexes and document counts</p>
          </div>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Collections', value: collections.length },
          { label: 'Total Indexes', value: totalIndexes },
          { label: 'Total Documents', value: totalDocs.toLocaleString() },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{k.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search collections..."
          className="w-full sm:w-72 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((coll) => {
            const isOpen = expanded.has(coll.collection);
            return (
              <div key={coll.collection} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button onClick={() => toggle(coll.collection)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <span className="font-medium text-gray-900 dark:text-white font-mono text-sm">{coll.collection}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>{coll.documentCount.toLocaleString()} docs</span>
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-medium">{coll.indexes.length} index{coll.indexes.length !== 1 ? 'es' : ''}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 text-left">
                          <th className="pb-2 pr-4 font-medium">Index Name</th>
                          <th className="pb-2 pr-4 font-medium">Key</th>
                          <th className="pb-2 pr-4 font-medium">Unique</th>
                          <th className="pb-2 pr-4 font-medium">Sparse</th>
                          <th className="pb-2 font-medium">TTL (s)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coll.indexes.map((idx) => (
                          <tr key={idx.name} className="border-t border-gray-50 dark:border-gray-700/50">
                            <td className="py-2 pr-4 font-mono text-gray-700 dark:text-gray-300">{idx.name}</td>
                            <td className="py-2 pr-4 font-mono text-gray-600 dark:text-gray-400">{JSON.stringify(idx.key)}</td>
                            <td className="py-2 pr-4">{idx.unique ? <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">Yes</span> : <span className="text-gray-400">—</span>}</td>
                            <td className="py-2 pr-4">{idx.sparse ? <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">Yes</span> : <span className="text-gray-400">—</span>}</td>
                            <td className="py-2">{idx.expireAfterSeconds != null ? idx.expireAfterSeconds : <span className="text-gray-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && !loading && <p className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">No collections found.</p>}
        </div>
      )}
    </div>
  );
};

export default DbIndexExplorerTab;
