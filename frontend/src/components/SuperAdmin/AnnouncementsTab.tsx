import { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  X,
  Eye,
  Clock,
  Users,
  Loader2,
  Search,
  Filter,
} from 'lucide-react';
import announcementService, { SystemAnnouncement, CreateAnnouncementPayload } from '../../services/announcementService';

const ALL_ROLES = [
  'super_admin', 'admin', 'manager', 'super_manager', 'supervisor',
  'clerk', 'driver', 'viewer', 'fuel_order_maker', 'boss', 'yard_personnel',
  'fuel_attendant', 'station_manager', 'payment_manager', 'dar_yard',
  'tanga_yard', 'mmsa_yard', 'import_officer', 'export_officer',
];

const SEVERITY_CONFIG = {
  info: { label: 'Info', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', dot: 'bg-blue-500', Icon: Info, bar: 'bg-blue-500' },
  warning: { label: 'Warning', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500', Icon: AlertTriangle, bar: 'bg-amber-500' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', dot: 'bg-red-600', Icon: AlertCircle, bar: 'bg-red-600' },
  success: { label: 'Success', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', dot: 'bg-green-500', Icon: CheckCircle, bar: 'bg-green-500' },
};

type SeverityKey = keyof typeof SEVERITY_CONFIG;

const BLANK_FORM: CreateAnnouncementPayload = {
  title: '',
  message: '',
  severity: 'info',
  targetRoles: [],
  showFrom: new Date().toISOString().slice(0, 16),
  showUntil: null,
  isDismissible: true,
  isActive: true,
};

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getStatus(ann: SystemAnnouncement): { label: string; color: string } {
  const now = new Date();
  if (!ann.isActive) return { label: 'Inactive', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  if (new Date(ann.showFrom) > now) return { label: 'Scheduled', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' };
  if (ann.showUntil && new Date(ann.showUntil) < now) return { label: 'Expired', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
  return { label: 'Live', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };
}

interface AnnouncementsTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function AnnouncementsTab({ onMessage }: AnnouncementsTabProps) {
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<SeverityKey | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'inactive' | 'scheduled' | 'expired'>('all');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateAnnouncementPayload>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<SystemAnnouncement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await announcementService.getAll();
      setAnnouncements(data);
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowPreview(false);
    setShowModal(true);
  };

  const openEdit = (ann: SystemAnnouncement) => {
    setEditingId(ann._id);
    setForm({
      title: ann.title,
      message: ann.message,
      severity: ann.severity,
      targetRoles: ann.targetRoles,
      showFrom: ann.showFrom ? new Date(ann.showFrom).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      showUntil: ann.showUntil ? new Date(ann.showUntil).toISOString().slice(0, 16) : null,
      isDismissible: ann.isDismissible,
      isActive: ann.isActive,
    });
    setShowPreview(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      onMessage('error', 'Title and message are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await announcementService.update(editingId, form);
        onMessage('success', 'Announcement updated');
      } else {
        await announcementService.create(form);
        onMessage('success', 'Announcement created and sent live');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ann: SystemAnnouncement) => {
    try {
      await announcementService.toggle(ann._id);
      load();
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to toggle');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await announcementService.delete(deleteTarget._id);
      onMessage('success', 'Announcement deleted');
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const toggleRole = (role: string) => {
    setForm((prev) => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter((r) => r !== role)
        : [...prev.targetRoles, role],
    }));
  };

  // Stats
  const now = new Date();
  const live = announcements.filter((a) => a.isActive && new Date(a.showFrom) <= now && (!a.showUntil || new Date(a.showUntil) > now));
  const scheduled = announcements.filter((a) => a.isActive && new Date(a.showFrom) > now);
  const inactive = announcements.filter((a) => !a.isActive);
  const expired = announcements.filter((a) => a.isActive && a.showUntil && new Date(a.showUntil) <= now);

  // Filter
  const filtered = announcements.filter((a) => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.message.toLowerCase().includes(search.toLowerCase());
    const matchSev = filterSeverity === 'all' || a.severity === filterSeverity;
    const status = getStatus(a).label.toLowerCase();
    const matchStatus = filterStatus === 'all' || status === filterStatus;
    return matchSearch && matchSev && matchStatus;
  });

  const PreviewBanner = () => {
    const sev = SEVERITY_CONFIG[form.severity as SeverityKey] ?? SEVERITY_CONFIG.info;
    const Icon = sev.Icon;
    return (
      <div className={`relative border rounded-lg overflow-hidden ${
        form.severity === 'info' ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200' :
        form.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200' :
        form.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200' :
        'bg-green-50 dark:bg-green-950/60 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
      }`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${sev.bar}`} />
        <div className="flex items-start gap-3 px-4 py-3 pl-5">
          <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-sm mr-2">{form.title || 'Announcement title'}</span>
            <span className="text-sm opacity-90">{form.message || 'Announcement message will appear here...'}</span>
          </div>
          {form.isDismissible && <X className="w-3.5 h-3.5 opacity-60 flex-shrink-0 mt-0.5" />}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">System Announcements</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Push banners to all users or specific roles in real time</p>
            </div>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Announcement
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Live', count: live.length, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', dot: 'bg-green-500' },
          { label: 'Scheduled', count: scheduled.length, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20', dot: 'bg-indigo-500' },
          { label: 'Expired', count: expired.length, color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800', dot: 'bg-gray-400' },
          { label: 'Inactive', count: inactive.length, color: 'text-gray-400 dark:text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800', dot: 'bg-gray-300' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-gray-100 dark:border-gray-700`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search announcements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as any)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
          >
            <option value="all">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="success">Success</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
          >
            <option value="all">All statuses</option>
            <option value="live">Live</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Announcements list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No announcements found</p>
          <p className="text-xs mt-1">Create one to broadcast a message to all users</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ann) => {
            const sevConfig = SEVERITY_CONFIG[ann.severity as SeverityKey] ?? SEVERITY_CONFIG.info;
            const SevIcon = sevConfig.Icon;
            const status = getStatus(ann);
            return (
              <div
                key={ann._id}
                className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-sm hover:shadow-md overflow-hidden"
              >
                {/* severity left bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${sevConfig.bar}`} />

                <div className="pl-5 pr-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`mt-0.5 p-1.5 rounded-lg ${sevConfig.color}`}>
                        <SevIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{ann.title}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sevConfig.color}`}>
                            {sevConfig.label}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                          {!ann.isDismissible && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                              Persistent
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{ann.message}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          {ann.targetRoles.length > 0 ? (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Users className="w-3 h-3" />
                              <span>{ann.targetRoles.join(', ')}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Users className="w-3 h-3" />
                              <span>All roles</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatDate(ann.showFrom)}</span>
                            {ann.showUntil && <span>→ {formatDate(ann.showUntil)}</span>}
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500">by {ann.createdBy}</span>
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggle(ann)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
                        title={ann.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {ann.isActive
                          ? <ToggleRight className="w-4 h-4 text-green-500" />
                          : <ToggleLeft className="w-4 h-4 text-gray-400" />
                        }
                      </button>
                      <button
                        onClick={() => openEdit(ann)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(ann)}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-lg h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">
                  {editingId ? 'Edit Announcement' : 'New Announcement'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Broadcast a system-wide message</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Preview toggle */}
            <div className="flex items-center gap-2 px-6 pt-4">
              <button
                onClick={() => setShowPreview(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!showPreview ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                Edit
              </button>
              <button
                onClick={() => setShowPreview(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showPreview ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {showPreview ? (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Banner preview</p>
                  <PreviewBanner />
                  <p className="text-xs text-gray-400">This is how the banner will appear at the top of the page for targeted users.</p>
                </div>
              ) : (
                <>
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="e.g. System maintenance tonight"
                      maxLength={200}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Message <span className="text-red-500">*</span></label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                      rows={3}
                      placeholder="Describe what users should know..."
                      maxLength={2000}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-none text-gray-900 dark:text-gray-100"
                    />
                    <p className="text-[10px] text-gray-400 text-right mt-0.5">{form.message.length}/2000</p>
                  </div>

                  {/* Severity */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Severity</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(SEVERITY_CONFIG) as SeverityKey[]).map((sev) => {
                        const cfg = SEVERITY_CONFIG[sev];
                        const Icon = cfg.Icon;
                        return (
                          <button
                            key={sev}
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, severity: sev }))}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${form.severity === sev ? `${cfg.color} border-transparent ring-2 ring-offset-1 ring-indigo-400` : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Target Roles */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Target Roles
                      <span className="ml-2 text-[10px] font-normal text-gray-400">(empty = all roles)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg max-h-36 overflow-y-auto">
                      {ALL_ROLES.map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleRole(role)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${form.targetRoles.includes(role) ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:border-indigo-300'}`}
                        >
                          {role.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Show From</label>
                      <input
                        type="datetime-local"
                        value={form.showFrom}
                        onChange={(e) => setForm((p) => ({ ...p, showFrom: e.target.value }))}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                        Show Until <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={form.showUntil ?? ''}
                        onChange={(e) => setForm((p) => ({ ...p, showUntil: e.target.value || null }))}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
                      />
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-3">
                    {[
                      { key: 'isDismissible', label: 'Dismissible', desc: 'Users can close this banner' },
                      { key: 'isActive', label: 'Active', desc: 'Show immediately when conditions are met' },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, [key]: !p[key as keyof typeof p] }))}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${(form as any)[key] ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${(form as any)[key] ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? 'Save Changes' : 'Publish Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Delete Announcement</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete <strong className="text-gray-900 dark:text-gray-100">"{deleteTarget.title}"</strong>? It will immediately be removed from all users' screens.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
