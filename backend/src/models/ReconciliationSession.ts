import mongoose, { Schema, Document } from 'mongoose';

export type ReconciliationStatus = 'draft' | 'in_progress' | 'completed' | 'dropped';

export type ReconciliationLineSource = 'date_range' | 'pending_carry';

export type ReconciliationMatchStatus =
  | 'unmatched_lpo'
  | 'unmatched_statement'
  | 'matched'
  | 'liter_mismatch'
  | 'stale_pending'
  | 'split_merge_candidate'
  | 'manual_matched'
  | 'dropped'
  | 'rectified';

export type ReconciliationMatchType = 'one_to_one' | 'split' | 'merge' | 'manual';

export type ReconciliationUserDecision = 'accept' | 'drop' | 'rectify';

export interface IStatementLine {
  lineIndex: number;
  rowNumber?: number;
  sn?: number;
  date: string;
  station: string;
  truckNo: string;
  truckNoRaw?: string;
  /** First truck as uploaded (before Fix/rectify). */
  originalTruckNo?: string;
  originalTruckNoRaw?: string;
  liters: number;
  amount?: number;
  lpoNo?: string;
  doNo?: string;
  notes?: string;
}

export interface IReconciliationLine {
  lpoEntryId?: string;
  lpoNo?: string;
  lpoDate?: string;
  lpoStation?: string;
  lpoTruckNo?: string;
  lpoTruckNoRaw?: string;
  lpoLiters?: number;
  linkedLpoEntryIds?: string[];
  lpoAmount?: number;
  lpoDoNo?: string;
  source?: ReconciliationLineSource;
  originSessionId?: string;
  statementLineIndex?: number;
  statementLineIndexes?: number[];
  statementRowNumber?: number;
  statementDate?: string;
  statementStation?: string;
  statementTruckNo?: string;
  statementTruckNoRaw?: string;
  /** Statement truck before Fix/rectify (audit). */
  originalStatementTruckNo?: string;
  originalStatementTruckNoRaw?: string;
  statementLiters?: number;
  matchType?: ReconciliationMatchType;
  matchGroupId?: string;
  statementAmount?: number;
  statementLpoNo?: string;
  statementDoNo?: string;
  matchStatus: ReconciliationMatchStatus;
  exceptionCode?: string;
  exceptionMessage?: string;
  daysGap?: number;
  userDecision?: ReconciliationUserDecision;
  notes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  carriedForwardToSessionId?: string;
}

export interface IReconciliationSummary {
  totalLpoLines: number;
  totalStatementLines: number;
  matched: number;
  pendingLpo: number;
  pendingStatement: number;
  exceptions: number;
  stalePending: number;
  literVarianceTotal: number;
  statementTotalLiters: number;
  lpoTotalLiters: number;
  reconciledStatementLiters: number;
  reconciledLpoLiters: number;
  literDifference: number;
  matchedLpoLines?: number;
  matchedStatementRows?: number;
  literVarianceDetails?: Array<{
    category: 'lpo_not_in_statement' | 'statement_not_in_lpo' | 'liter_mismatch';
    truckNo: string;
    station: string;
    lpoLiters: number;
    statementLiters: number;
    difference: number;
    reason: string;
    statementRows?: string;
    statementSn?: number;
    lineId?: string;
    originSessionId?: string;
  }>;
}

export interface IReconciliationSession extends Document {
  sessionNo: string;
  title?: string;
  status: ReconciliationStatus;
  stations: string[];
  dateFrom: string;
  dateTo: string;
  pendingMode: 'none' | 'all' | 'date_range' | 'selected';
  pendingDateFrom?: string;
  pendingDateTo?: string;
  selectedPendingEntryIds?: string[];
  staleMatchThresholdDays: number;
  statementFileName?: string;
  statementUploadedAt?: Date;
  statementStationMappings?: Record<string, string>;
  flaggedStatementStations?: string[];
  statementLines: IStatementLine[];
  lines: IReconciliationLine[];
  summary: IReconciliationSummary;
  createdBy: string;
  updatedBy?: string;
  completedBy?: string;
  completedAt?: Date;
  droppedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const statementLineSchema = new Schema<IStatementLine>(
  {
    lineIndex: { type: Number, required: true },
    rowNumber: { type: Number },
    sn: { type: Number },
    date: { type: String, required: true, trim: true },
    station: { type: String, required: true, trim: true },
    truckNo: { type: String, required: true, trim: true },
    truckNoRaw: { type: String, trim: true },
    originalTruckNo: { type: String, trim: true },
    originalTruckNoRaw: { type: String, trim: true },
    liters: { type: Number, required: true, min: 0 },
    amount: { type: Number, min: 0 },
    lpoNo: { type: String, trim: true },
    doNo: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const reconciliationLineSchema = new Schema<IReconciliationLine>(
  {
    lpoEntryId: { type: String, trim: true },
    lpoNo: { type: String, trim: true },
    lpoDate: { type: String, trim: true },
    lpoStation: { type: String, trim: true },
    lpoTruckNo: { type: String, trim: true },
    lpoTruckNoRaw: { type: String, trim: true },
    linkedLpoEntryIds: { type: [String], default: undefined },
    lpoLiters: { type: Number, min: 0 },
    lpoAmount: { type: Number, min: 0 },
    lpoDoNo: { type: String, trim: true },
    source: { type: String, enum: ['date_range', 'pending_carry'] },
    originSessionId: { type: String, trim: true },
    statementLineIndex: { type: Number },
    statementLineIndexes: { type: [Number], default: undefined },
    statementRowNumber: { type: Number },
    statementDate: { type: String, trim: true },
    statementStation: { type: String, trim: true },
    statementTruckNo: { type: String, trim: true },
    statementTruckNoRaw: { type: String, trim: true },
    originalStatementTruckNo: { type: String, trim: true },
    originalStatementTruckNoRaw: { type: String, trim: true },
    statementLiters: { type: Number, min: 0 },
    matchType: { type: String, enum: ['one_to_one', 'split', 'merge', 'manual'] },
    matchGroupId: { type: String, trim: true },
    statementAmount: { type: Number, min: 0 },
    statementLpoNo: { type: String, trim: true },
    statementDoNo: { type: String, trim: true },
    matchStatus: {
      type: String,
      enum: [
        'unmatched_lpo',
        'unmatched_statement',
        'matched',
        'liter_mismatch',
        'stale_pending',
        'split_merge_candidate',
        'manual_matched',
        'dropped',
        'rectified',
      ],
      required: true,
    },
    exceptionCode: { type: String, trim: true },
    exceptionMessage: { type: String, trim: true },
    daysGap: { type: Number },
    userDecision: { type: String, enum: ['accept', 'drop', 'rectify'] },
    notes: { type: String, trim: true },
    resolvedAt: { type: Date },
    resolvedBy: { type: String, trim: true },
    carriedForwardToSessionId: { type: String, trim: true },
  },
  { _id: true }
);

const reconciliationSummarySchema = new Schema<IReconciliationSummary>(
  {
    totalLpoLines: { type: Number, default: 0 },
    totalStatementLines: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    pendingLpo: { type: Number, default: 0 },
    pendingStatement: { type: Number, default: 0 },
    exceptions: { type: Number, default: 0 },
    stalePending: { type: Number, default: 0 },
    literVarianceTotal: { type: Number, default: 0 },
    statementTotalLiters: { type: Number, default: 0 },
    lpoTotalLiters: { type: Number, default: 0 },
    reconciledStatementLiters: { type: Number, default: 0 },
    reconciledLpoLiters: { type: Number, default: 0 },
    literDifference: { type: Number, default: 0 },
    matchedLpoLines: { type: Number, default: 0 },
    matchedStatementRows: { type: Number, default: 0 },
    literVarianceDetails: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const reconciliationSessionSchema = new Schema<IReconciliationSession>(
  {
    sessionNo: { type: String, required: true, unique: true, trim: true },
    title: { type: String, trim: true },
    status: {
      type: String,
      enum: ['draft', 'in_progress', 'completed', 'dropped'],
      default: 'draft',
    },
    stations: { type: [String], required: true, default: [] },
    dateFrom: { type: String, required: true, trim: true },
    dateTo: { type: String, required: true, trim: true },
    pendingMode: {
      type: String,
      enum: ['none', 'all', 'date_range', 'selected'],
      default: 'none',
    },
    pendingDateFrom: { type: String, trim: true },
    pendingDateTo: { type: String, trim: true },
    selectedPendingEntryIds: { type: [String], default: [] },
    staleMatchThresholdDays: { type: Number, default: 45, min: 1 },
    statementFileName: { type: String, trim: true },
    statementUploadedAt: { type: Date },
    statementStationMappings: { type: Map, of: String, default: undefined },
    flaggedStatementStations: { type: [String], default: undefined },
    statementLines: { type: [statementLineSchema], default: [] },
    lines: { type: [reconciliationLineSchema], default: [] },
    summary: { type: reconciliationSummarySchema, default: () => ({}) },
    createdBy: { type: String, required: true, trim: true },
    updatedBy: { type: String, trim: true },
    completedBy: { type: String, trim: true },
    completedAt: { type: Date },
    droppedAt: { type: Date },
  },
  { timestamps: true }
);

reconciliationSessionSchema.index({ status: 1, createdAt: -1 });
reconciliationSessionSchema.index({ stations: 1, status: 1 });
reconciliationSessionSchema.index({ 'lines.lpoEntryId': 1, 'lines.carriedForwardToSessionId': 1 });

export const ReconciliationSession = mongoose.model<IReconciliationSession>(
  'ReconciliationSession',
  reconciliationSessionSchema
);
