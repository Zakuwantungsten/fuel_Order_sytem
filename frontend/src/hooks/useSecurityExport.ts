/**
 * useSecurityExport — hook providing CSV export functions for security data.
 * Server-side exports for events and audit logs, client-side for sessions/score.
 */
import { useCallback, useState } from 'react';

function getToken() {
  return sessionStorage.getItem('fuel_order_token') || '';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useSecurityExport() {
  const [exporting, setExporting] = useState(false);

  /**
   * Export security events CSV (server-side).
   */
  const exportSecurityEvents = useCallback(async (hours = 24) => {
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/system-admin/security-events/export?hours=${hours}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      triggerDownload(blob, `security-events-${dateSuffix()}.csv`);
    } finally {
      setExporting(false);
    }
  }, []);

  /**
   * Export security audit log CSV (server-side).
   */
  const exportAuditLog = useCallback(async (days = 30) => {
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/system-admin/security-audit-log/export?days=${days}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      triggerDownload(blob, `security-audit-log-${dateSuffix()}.csv`);
    } finally {
      setExporting(false);
    }
  }, []);

  /**
   * Client-side CSV export. Accepts an array of objects and a filename.
   */
  const exportClientCSV = useCallback((data: Record<string, any>[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => {
        const v = row[h];
        const str = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${filename}-${dateSuffix()}.csv`);
  }, []);

  return { exporting, exportSecurityEvents, exportAuditLog, exportClientCSV };
}
