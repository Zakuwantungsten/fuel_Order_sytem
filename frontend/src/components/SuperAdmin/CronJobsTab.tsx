import { useState, useEffect, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';
import {
  Clock, Play, Power, RefreshCw, CheckCircle, XCircle,
  AlertCircle, ChevronDown, ChevronUp, Activity, Timer,
} from 'lucide-react';
import cronJobService, { CronJob, JobRunRecord } from '../../services/cronJobService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-GB', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(ms?: number) {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function StatusBadge({ status }: { status: CronJob['status'] }) {
  const cfg: Record<string, { label: string; cls: string; dot: string }> = {
    idle:     { label: 'Idle',     cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',      dot: 'bg-gray-400' },
    running:  { label: 'Running',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',    dot: 'bg-blue-500 animate-pulse' },
    error:    { label: 'Error',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',        dot: 'bg-red-500' },
    disabled: { label: 'Disabled', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dot: 'bg-yellow-400' },
  };
  const c = cfg[status] ?? cfg.idle;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function HistoryRow({ record }: { record: JobRunRecord }) {
  return (
    <div className={`flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0`}>
      {record.success
        ? <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
        : <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
      }
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-medium ${record.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {record.success ? 'Success' : 'Failed'}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatDuration(record.durationMs)}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(record.startedAt)}</p>
        {record.message && <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate">{record.message}</p>}
      </div>
    </div>
  );
}

function JobCard({ job, onRefresh, onMessage }: { job: CronJob; onRefresh: () => void; onMessage: Props['onMessage'] }) {
  const [expanded, setExpanded] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmTrigger, setConfirmTrigger] = useState(false);

  function handleTrigger() {
    setConfirmTrigger(true);
  }

  async function doTrigger() {
    setConfirmTrigger(false);
    setTriggering(true);
    try {
      const record = await cronJobService.trigger(job.id);
      onMessage(`"${job.name}" completed${record.success ? '' : ' with errors'} in ${formatDuration(record.durationMs)}`, record.success ? 'success' : 'error');
      onRefresh();
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Trigger failed', 'error');
    } finally {
      setTriggering(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await cronJobService.toggle(job.id);
      onMessage(`"${job.name}" ${job.isEnabled ? 'disabled' : 'enabled'}`, 'success');
      onRefresh();
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Toggle failed', 'error');
    } finally {
      setToggling(false);
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{job.name}</h3>
                <StatusBadge status={job.status} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{job.description}</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                  <Clock className="w-3 h-3" />
                  {job.cronExpression}
                </span>
                {job.lastRunAt && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    Last: {formatDate(job.lastRunAt)} ({formatDuration(job.lastRunDuration)})
                    {job.lastRunStatus === 'success'
                      ? <CheckCircle className="w-3 h-3 text-green-500" />
                      : <XCircle className="w-3 h-3 text-red-500" />
                    }
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleTrigger}
                disabled={triggering || job.status === 'running'}
                title="Trigger now"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                {triggering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Run
              </button>
              <button
                onClick={handleToggle}
                disabled={toggling}
                title={job.isEnabled ? 'Disable' : 'Enable'}
                className={`p-2 rounded-lg transition-colors ${job.isEnabled ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                {toggling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400"
                title="View run history"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Run History (last {job.runHistory.length})</p>
            {job.runHistory.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No runs recorded yet.</p>
            ) : (
              <div className="space-y-0">
                {job.runHistory.map((r, i) => <HistoryRow key={i} record={r} />)}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmTrigger}
        title={`Run "${job.name}" Now`}
        message={`Manually trigger "${job.name}" outside its schedule? The job will run immediately.`}
        variant="info"
        confirmLabel="Run Now"
        loading={triggering}
        onConfirm={doTrigger}
        onCancel={() => setConfirmTrigger(false)}
      />
    </>
  );
}

export default function CronJobsTab({ onMessage }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    try {
      const data = await cronJobService.list();
      setJobs(data);
    } catch {
      onMessage('Failed to load cron jobs', 'error');
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const enabledCount = jobs.filter((j) => j.isEnabled).length;
  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const errorCount = jobs.filter((j) => j.status === 'error').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Cron Job Manager</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Monitor, run, and manage all scheduled background jobs</p>
        </div>
        <button
          onClick={loadJobs}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Jobs', value: jobs.length, icon: Clock, color: 'text-indigo-500' },
          { label: 'Enabled', value: enabledCount, icon: Power, color: 'text-green-500' },
          { label: 'Running', value: runningCount, icon: Activity, color: 'text-blue-500' },
          { label: 'Errors', value: errorCount, icon: AlertCircle, color: 'text-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Job Cards */}
      {jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No cron jobs registered.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onRefresh={loadJobs} onMessage={onMessage} />
          ))}
        </div>
      )}
    </div>
  );
}
