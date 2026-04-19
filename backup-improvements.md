# Backup & Recovery — Improvements Roadmap

---

## 🚨 Bug Fixes (Already Applied)

### Issue: AuditLog validation crash on every backup creation

**Root cause (from logs):**
```
Error creating backup: AuditLog validation failed:
  - details: Cast to string failed for value "{...}" (type Object) at path "details"
  - resourceType: Path `resourceType` is required.
  - username: Path `username` is required.
  - action: `backup_created` is not a valid enum value for path `action`.
```

**All `AuditLog.create()` calls in `backupService.ts` and `backupController.ts` had four simultaneous bugs:**

| Bug | Wrong | Correct |
|-----|-------|---------|
| Field name for user | `user:` | `username:` |
| Field name for resource type | `resource:` | `resourceType:` |
| `action` value | `'backup_created'`, `'backup_downloaded'`, `'backup_restored'`, `'backup_deleted'`, `'backup_schedule_created'`, `'backup_schedule_updated'`, `'backup_schedule_deleted'`, `'backups_cleaned'` | Valid enum: `'CREATE'`, `'EXPORT'`, `'RESTORE'`, `'DELETE'`, `'UPDATE'`, `'BULK_OPERATION'` |
| `details` type | Object `{ key: value }` | `JSON.stringify({ key: value })` (schema expects `String`) |

**Files fixed:**
- `backend/src/services/backupService.ts` — `createBackup()`, `restoreBackup()`
- `backend/src/controllers/backupController.ts` — `downloadBackup()`, `deleteBackup()`, `createBackupSchedule()`, `updateBackupSchedule()`, `deleteBackupSchedule()`, `cleanupBackups()`

---

## 🔧 Quick Wins — UI Improvements (No Backend Changes)

Data is already available in the model; these are purely frontend display changes in `BackupRecoveryTab.tsx`.

### QW-1: Show Encryption & Compression Metadata

**What:** Each backup row should show a lock icon and compression ratio in the detail line.

**Data source:** `backup.metadata.encrypted`, `backup.metadata.encryptionAlgorithm`, `backup.metadata.compression`, `backup.metadata.databaseSize`

**Implementation:**
```tsx
// In the backup row detail line, add after document count:
{backup.metadata?.encrypted && (
  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
    <Lock className="w-3 h-3" />
    AES-256-GCM
  </span>
)}
{backup.metadata?.compression && (
  <span className="text-xs text-gray-500 dark:text-gray-400">
    {backup.metadata.compression} · {
      backup.metadata.databaseSize
        ? `${((1 - backup.fileSize / backup.metadata.databaseSize) * 100).toFixed(0)}% compressed`
        : backup.metadata.compression
    }
  </span>
)}
```

---

### QW-2: Show Collections Backed Up

**What:** Expandable "chevron" on each backup row showing which collections were included.

**Data source:** `backup.collections` (already an array of strings on every backup)

**Implementation:** Add an expand toggle per row. On expand, render a `flex-wrap` pill list of collection names.

---

### QW-3: Next Scheduled Run Countdown

**What:** Show `nextRun` as a human-readable countdown in the Backup Schedules section.

**Data source:** `schedule.nextRun` (already stored in `BackupSchedule` model)

**Implementation:**
```tsx
// Helper
function timeUntil(date: string): string {
  const diff = new Date(date).getTime() - Date.now();
  if (diff <= 0) return 'Due now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

// In schedule row:
{schedule.nextRun && (
  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
    Next: {timeUntil(schedule.nextRun)}
  </span>
)}
```

---

### QW-4: Restore Progress Polling

**What:** After a restore is triggered, poll the backup status every 3 seconds and show a live progress indicator until `status !== 'in_progress'`.

**Implementation:**
```tsx
const [restoringId, setRestoringId] = useState<string | null>(null);

// After calling restoreBackup API:
setRestoringId(backup.id);
const poll = setInterval(async () => {
  const updated = await backupAPI.getBackupById(backup.id);
  if (updated.status !== 'in_progress') {
    clearInterval(poll);
    setRestoringId(null);
    onMessage(updated.status === 'completed' ? 'success' : 'error',
      updated.status === 'completed' ? 'Restore completed successfully' : `Restore failed: ${updated.error}`
    );
    loadData();
  }
}, 3000);
```

Add a `getBackupById(id)` method to `backupAPI` in `api.ts`.

---

## 🛠 Medium Effort — Backend + Frontend

### ME-1: Backup Integrity Verification

**What:** A "Verify" action per backup that tests decryptability and decompressibility without doing a full restore.

**Backend — new endpoint:** `POST /api/backup/backups/:id/verify`

```typescript
export const verifyBackup = async (req: AuthRequest, res: Response) => {
  const backup = await Backup.findById(req.params.id);
  if (!backup || backup.status !== 'completed') {
    return res.status(400).json({ success: false, message: 'Backup not eligible for verification' });
  }

  try {
    // 1. Download from R2
    const stream = await r2Service.downloadFile(backup.r2Key, config.r2BackupBucketName);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    let buffer = Buffer.concat(chunks);

    // 2. Attempt decrypt (if encrypted)
    if (backup.metadata?.encrypted) {
      buffer = decryptBuffer(buffer, process.env.BACKUP_ENCRYPTION_KEY!);
    }

    // 3. Attempt decompress + parse JSON header only
    const gunzip = promisify(zlib.gunzip);
    const decompressed = await gunzip(buffer);
    const parsed = JSON.parse(decompressed.toString());
    const isValid = !!parsed.timestamp && !!parsed.collections;

    // 4. Update backup record
    await Backup.findByIdAndUpdate(req.params.id, {
      'metadata.verifiedAt': new Date(),
      'metadata.verificationPassed': isValid,
    });

    await AuditLog.create({
      username: req.user?.username || 'system',
      action: 'VERIFY_INTEGRITY',
      resourceType: 'backup',
      resourceId: backup.id,
      details: JSON.stringify({ passed: isValid }),
    });

    res.json({ success: true, data: { passed: isValid } });
  } catch (err: any) {
    await Backup.findByIdAndUpdate(req.params.id, {
      'metadata.verifiedAt': new Date(),
      'metadata.verificationPassed': false,
    });
    res.status(500).json({ success: false, message: 'Verification failed: ' + err.message });
  }
};
```

**Model change** — add to `Backup.ts` metadata:
```typescript
metadata?: {
  // ... existing fields ...
  verifiedAt?: Date;
  verificationPassed?: boolean;
};
```

**Frontend:** Replace the static icon in `getStatusIcon()` with a verified/unverified badge. Add a "Verify" button beside Download.

---

### ME-2: Storage Quota Gauge

**What:** Show used storage as a bar gauge in the Stats section — "X GB used of Y GB quota".

**Backend — update `getBackupStats()`** to include per-type breakdown:
```typescript
const byType = await Backup.aggregate([
  { $match: { status: 'completed' } },
  { $group: { _id: '$type', size: { $sum: '$fileSize' }, count: { $sum: 1 } } }
]);
return { ..., byType };
```

**Frontend:** Add a `BACKUP_STORAGE_QUOTA_GB` env variable (e.g. `5`) and render a progress bar:
```tsx
const quotaBytes = (import.meta.env.VITE_BACKUP_QUOTA_GB ?? 5) * 1024 * 1024 * 1024;
const pct = Math.min(100, (stats.totalSize / quotaBytes) * 100);
// render a gradient progress bar: green < 70%, amber < 90%, red >= 90%
```

---

### ME-3: Failure Alert Email

**What:** When a scheduled backup fails, email the super-admin.

**Backend — update `backupService.ts`** in the `catch` block of `createBackup()`:
```typescript
// After backup.save() in catch block:
try {
  const { SystemConfig } = require('../models');
  const cfg = await SystemConfig.findOne({ configType: 'system_settings' });
  const adminEmail = cfg?.systemSettings?.general?.adminEmail;
  if (adminEmail) {
    await emailService.sendBackupFailureAlert(adminEmail, {
      fileName: backup.fileName,
      error: error.message,
      time: new Date(),
    });
  }
} catch { /* don't block */ }
```

**Email service — add `sendBackupFailureAlert()`** in `emailService.ts` following the same pattern as `sendLoginNotification`.

**Frontend:** Add a `Backup Failure Alerts` toggle in the schedule card (per-schedule config).

---

## 🏗 Large Effort — Architecture Changes

### LE-1: Tiered Retention Policy

**What:** Replace single `retentionDays` with a 3-tier policy: keep N daily, N weekly, N monthly copies.

**Model change — `BackupSchedule.ts`:**
```typescript
retentionPolicy?: {
  daily: { count: number };    // e.g. keep last 7 daily
  weekly: { count: number };   // e.g. keep last 4 weekly
  monthly: { count: number };  // e.g. keep last 12 monthly
};
```

**Scheduler change — `backupScheduler.ts`:** After each backup completes, run cleanup by tier:
1. Tag each backup as `daily`, `weekly` (Sunday), or `monthly` (1st of month) at creation time
2. For each tier, keep only the N most recent backups of that tier type

**Frontend:** Replace the single `retentionDays` field in the schedule form with three number inputs in a table:

| Tier | Keep copies |
|------|------------|
| Daily | `[7]` |
| Weekly | `[4]` |
| Monthly | `[12]` |

---

### LE-2: Selective Collection Backup

**What:** Allow the super-admin to create a backup of specific collections only (e.g., just `users` + `drivercredentials` for a fast user-data-only backup).

**Backend — update `createBackup()`** to accept optional `collections` param:
```typescript
async createBackup(
  userId: string,
  type: 'manual' | 'scheduled' = 'manual',
  selectedCollections?: string[]   // if undefined → backup all
): Promise<any>
```

**Controller:**
```typescript
const { collections: selectedCollections } = req.body; // optional string[]
await backupService.createBackup(userId, 'manual', selectedCollections);
```

**Frontend:** Add a multi-select checkbox list (sourced from `backup.collections` of last backup) in a "Create Backup" modal instead of a direct button. Default: all selected.

---

### LE-3: Soft Delete / Recovery Window

**What:** Deleted backups go to a "trash" state for 7 days before the R2 file is actually deleted.

**Model change — `Backup.ts`:**
```typescript
status: 'in_progress' | 'completed' | 'failed' | 'deleted';
deletedAt?: Date;
deletedBy?: string;
```

**Controller change — `deleteBackup()`:**
```typescript
// Instead of immediate R2 deletion:
backup.status = 'deleted';
backup.deletedAt = new Date();
backup.deletedBy = userId;
await backup.save();
// Do NOT delete from R2 yet
```

**New scheduled job — `backupTrashCleanup.ts`:** Runs daily, permanently deletes backups where `status = 'deleted'` and `deletedAt < 7 days ago`.

**Frontend:** Add a "Trash" tab in the backup list showing deleted backups with a "Restore from Trash" and "Permanently Delete" action.

---

## Priority Summary

| # | Item | Effort | Impact |
|---|------|--------|--------|
| ✅ | Fix AuditLog crashes | Done | Backups now actually save |
| QW-1 | Show encryption/compression in UI | 1–2 hrs | High |
| QW-2 | Show collections list | 1–2 hrs | Medium |
| QW-3 | Next run countdown | 30 min | Medium |
| QW-4 | Restore progress polling | 2–3 hrs | High |
| ME-1 | Backup integrity verification | 4–6 hrs | High |
| ME-2 | Storage quota gauge | 2–3 hrs | Medium |
| ME-3 | Failure alert emails | 3–4 hrs | High |
| LE-1 | Tiered retention policy | 1–2 days | High |
| LE-2 | Selective collection backup | 1 day | Medium |
| LE-3 | Soft delete / trash | 1 day | High |
