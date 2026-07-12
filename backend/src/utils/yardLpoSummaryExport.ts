import { Response } from 'express';
import ExcelJS from 'exceljs';
import { Model } from 'mongoose';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { logger } from './index';
import { AuditService } from './auditService';
import {
  MONTH_ABBR,
  monthAbbrToRange,
  monthAbbrFromDate,
  addYardLpoSummaryMonthSheet,
  addYardLpoYearSummarySheet,
} from './summaryTabExport';

export interface YardFlatEntry {
  date: string;
  lpoNo: string;
  dieselAt: string;
  doSdo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  destinations: string;
  isCancelled: boolean;
}

function flattenYardDocs(docs: any[], dieselAt: string): YardFlatEntry[] {
  const entries: YardFlatEntry[] = [];
  for (const doc of docs) {
    const sorted = [...(doc.entries || [])].sort(
      (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
    for (const e of sorted) {
      const liters = e.liters ?? 0;
      const rate = e.rate ?? 0;
      entries.push({
        date: doc.date,
        lpoNo: doc.lpoNo,
        dieselAt,
        doSdo: e.doNo || 'NIL',
        truckNo: e.truckNo,
        liters,
        rate,
        amount: e.amount != null ? e.amount : liters * rate,
        destinations: e.dest || '',
        isCancelled: !!e.isCancelled,
      });
    }
  }
  entries.sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a.lpoNo || '').localeCompare(String(b.lpoNo || ''));
  });
  return entries;
}

async function loadYardEntriesForRange(
  Model: Model<any>,
  dieselAt: string,
  dateFrom: string,
  dateTo: string
): Promise<YardFlatEntry[]> {
  const docs = await Model.find({
    isDeleted: false,
    date: { $gte: dateFrom, $lte: dateTo },
  })
    .sort({ date: 1, lpoNo: 1 })
    .lean();

  return flattenYardDocs(docs, dieselAt);
}

export type YardSummaryExportConfig = {
  Model: Model<any>;
  dieselAt: string;
  filePrefix: string;
  resourceType: string;
  label: string;
};

export function createYardSummaryExportHandlers(cfg: YardSummaryExportConfig) {
  const exportSummaryMonth = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const year = parseInt(String(req.query.year || ''), 10);
      const month = String(req.query.month || '').trim();
      if (isNaN(year) || !month || !MONTH_ABBR.includes(month)) {
        throw new ApiError(400, 'year and month (Jan..Dec) are required');
      }

      const monthRange = monthAbbrToRange(month, year);
      if (!monthRange) throw new ApiError(400, 'Invalid month/year');

      const entries = await loadYardEntriesForRange(
        cfg.Model,
        cfg.dieselAt,
        monthRange.dateFrom,
        monthRange.dateTo
      );

      if (entries.length === 0) {
        throw new ApiError(404, `No ${cfg.label} entries found for the selected month`);
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Fuel Order System';
      workbook.created = new Date();
      addYardLpoSummaryMonthSheet(workbook, `${month}_${year}`, entries);

      const filename = `${cfg.filePrefix}_Summary_${month}_${year}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);

      await AuditService.log({
        userId: req.user?.userId,
        username: req.user?.username || 'system',
        action: 'EXPORT',
        resourceType: cfg.resourceType,
        resourceId: `${month}_${year}`,
        details: `${cfg.label} summary month export (${entries.length} rows) by ${req.user?.username}`,
        ipAddress: req.ip,
        severity: 'low',
      }).catch(() => {});

      res.end();
      logger.info(`${cfg.label} summary month ${month} ${year} exported by ${req.user?.username}`);
    } catch (error: any) {
      if (error instanceof ApiError) {
        if (!res.headersSent) res.status(error.statusCode).json({ error: error.message });
      } else {
        logger.error(`Error exporting ${cfg.label} summary month:`, error);
        if (!res.headersSent) res.status(500).json({ error: `Failed to export ${cfg.label} summary` });
      }
    }
  };

  const exportSummaryYear = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const year = parseInt(String(req.query.year || ''), 10);
      if (isNaN(year)) throw new ApiError(400, 'year is required');

      const entries = await loadYardEntriesForRange(
        cfg.Model,
        cfg.dieselAt,
        `${year}-01-01`,
        `${year}-12-31`
      );

      if (entries.length === 0) {
        throw new ApiError(404, `No ${cfg.label} entries found for the selected year`);
      }

      const byMonth = new Map<string, YardFlatEntry[]>();
      for (const entry of entries) {
        const mon = monthAbbrFromDate(entry.date);
        if (!mon) continue;
        if (!byMonth.has(mon)) byMonth.set(mon, []);
        byMonth.get(mon)!.push(entry);
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Fuel Order System';
      workbook.created = new Date();

      for (const month of MONTH_ABBR) {
        const monthEntries = byMonth.get(month);
        if (!monthEntries || monthEntries.length === 0) continue;
        addYardLpoSummaryMonthSheet(workbook, `${month}_${year}`, monthEntries);
      }
      addYardLpoYearSummarySheet(workbook, year, byMonth);

      const filename = `${cfg.filePrefix}_Summary_${year}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);

      await AuditService.log({
        userId: req.user?.userId,
        username: req.user?.username || 'system',
        action: 'EXPORT',
        resourceType: cfg.resourceType,
        resourceId: String(year),
        details: `${cfg.label} summary year export (${entries.length} rows) by ${req.user?.username}`,
        ipAddress: req.ip,
        severity: 'low',
      }).catch(() => {});

      res.end();
      logger.info(`${cfg.label} summary year ${year} exported by ${req.user?.username}`);
    } catch (error: any) {
      if (error instanceof ApiError) {
        if (!res.headersSent) res.status(error.statusCode).json({ error: error.message });
      } else {
        logger.error(`Error exporting ${cfg.label} summary year:`, error);
        if (!res.headersSent) res.status(500).json({ error: `Failed to export ${cfg.label} summary` });
      }
    }
  };

  return { exportSummaryMonth, exportSummaryYear };
}
