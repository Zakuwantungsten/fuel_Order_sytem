import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { AuditLog } from '../models';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: 'audit' | 'logfile';
}

/**
 * GET /api/system-admin/email-logs
 * Returns recent email-related audit entries + logfile lines containing email keywords
 */
export const getEmailLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  // Query audit log for PASSWORD_RESET actions (which trigger emails)
  const auditEntries = await AuditLog.find({
    $or: [
      { action: 'PASSWORD_RESET' },
      { action: 'CREATE', resourceType: 'user' }, // user creation emails
      { resourceType: 'email' },
    ],
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('timestamp username action resourceType details outcome ipAddress')
    .lean();

  const auditMapped: LogEntry[] = auditEntries.map((e) => ({
    timestamp: e.timestamp?.toISOString() || new Date().toISOString(),
    level: e.outcome === 'FAILURE' ? 'error' : 'info',
    message: `[${e.action}] ${e.username || 'system'} — ${e.details || e.resourceType}`,
    source: 'audit',
  }));

  // Read last portion of the app log file and filter for email keywords
  const logFilePath = path.resolve(config.logFile);
  let logFileEntries: LogEntry[] = [];

  if (fs.existsSync(logFilePath)) {
    try {
      const stat = fs.statSync(logFilePath);
      const readSize = Math.min(stat.size, 512 * 1024); // last 512 KB
      const fd = fs.openSync(logFilePath, 'r');
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
      fs.closeSync(fd);

      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      const EMAIL_KEYWORDS = /email|nodemailer|smtp|sendmail|password.*reset|user.*created|notification/i;

      for (const line of lines) {
        if (!EMAIL_KEYWORDS.test(line)) continue;
        try {
          const parsed = JSON.parse(line);
          logFileEntries.push({
            timestamp: parsed.timestamp || new Date().toISOString(),
            level: parsed.level || 'info',
            message: parsed.message || line,
            source: 'logfile',
          });
        } catch {
          // plain-text line
          logFileEntries.push({ timestamp: '', level: 'info', message: line, source: 'logfile' });
        }
      }

      // Keep last N entries from logfile
      logFileEntries = logFileEntries.slice(-limit);
    } catch {
      // non-fatal
    }
  }

  const combined = [...auditMapped, ...logFileEntries].sort(
    (a, b) => (b.timestamp > a.timestamp ? 1 : -1)
  );

  res.json({ success: true, data: combined.slice(0, limit) });
};

