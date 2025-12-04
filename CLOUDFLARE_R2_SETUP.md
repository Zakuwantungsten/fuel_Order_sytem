# Cloudflare R2 Backup Setup Guide

## Overview
The Fuel Order system now uses **Cloudflare R2** (S3-compatible object storage) for secure, reliable database backups. R2 offers cost-effective cloud storage with no egress fees.

## Features Implemented

### Backend Components
- ✅ **Backup Models**: `Backup` and `BackupSchedule` MongoDB schemas
- ✅ **R2 Service**: S3-compatible client for Cloudflare R2
- ✅ **Backup Service**: Database export, compression, upload, and restore
- ✅ **Backup Controller**: REST API endpoints for backup management
- ✅ **Automatic Cleanup**: Retention policy enforcement

### Frontend Components
- ✅ **BackupRecoveryTab**: Full UI with real-time data
- ✅ **Statistics Dashboard**: Total backups, size, success/failure counts
- ✅ **Backup List**: View, download, restore, and delete backups
- ✅ **Schedule Management**: Configure automated backup schedules
- ✅ **Status Indicators**: Real-time backup progress and states

## Cloudflare R2 Setup Instructions

### Step 1: Create Cloudflare R2 Bucket

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com/
   - Navigate to **R2** in the left sidebar

2. **Create a New Bucket**
   - Click **"Create bucket"**
   - Name: `fuel-order-backups` (or your preferred name)
   - Location: Choose closest to your server (auto is fine)
   - Click **"Create bucket"**

### Step 2: Generate API Tokens

1. **Create R2 API Token**
   - In R2 dashboard, go to **"Manage R2 API Tokens"**
   - Click **"Create API token"**
   - Token name: `fuel-order-backup-access`
   - Permissions: **Edit** (allows read, write, delete)
   - Specify buckets: Select `fuel-order-backups`
   - Click **"Create API Token"**

2. **Save Credentials**
   - Copy the **Access Key ID**
   - Copy the **Secret Access Key**
   - **Important**: Save these securely - the secret won't be shown again!

### Step 3: Get R2 Endpoint

1. **Find Your Account ID**
   - In R2 dashboard, look for your account endpoint
   - Format: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - Your account ID is visible in the dashboard URL or bucket settings

### Step 4: Configure Backend

1. **Update `.env` File**
   ```bash
   # Add these to your backend/.env file
   R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your-access-key-id-here
   R2_SECRET_ACCESS_KEY=your-secret-access-key-here
   R2_BUCKET_NAME=fuel-order-backups
   ```

2. **Test Configuration**
   ```bash
   cd backend
   npm run dev
   ```

## API Endpoints

### Backup Management

#### Create Manual Backup
```http
POST /api/system-admin/backups
Authorization: Bearer <super_admin_token>
```

#### Get All Backups
```http
GET /api/system-admin/backups?status=completed&page=1&limit=20
Authorization: Bearer <super_admin_token>
```

#### Download Backup
```http
GET /api/system-admin/backups/:id/download
Authorization: Bearer <super_admin_token>
```
Returns a signed URL valid for 1 hour.

#### Restore Backup
```http
POST /api/system-admin/backups/:id/restore
Authorization: Bearer <super_admin_token>
```
⚠️ **Warning**: This will replace all current database data!

#### Delete Backup
```http
DELETE /api/system-admin/backups/:id
Authorization: Bearer <super_admin_token>
```

#### Get Backup Statistics
```http
GET /api/system-admin/backups/stats
Authorization: Bearer <super_admin_token>
```

### Backup Schedules

#### Create Schedule
```http
POST /api/system-admin/backup-schedules
Content-Type: application/json
Authorization: Bearer <super_admin_token>

{
  "name": "Daily Backup",
  "frequency": "daily",
  "time": "02:00",
  "retentionDays": 30
}
```

#### Get All Schedules
```http
GET /api/system-admin/backup-schedules
Authorization: Bearer <super_admin_token>
```

#### Update Schedule
```http
PUT /api/system-admin/backup-schedules/:id
Content-Type: application/json
Authorization: Bearer <super_admin_token>

{
  "enabled": true,
  "retentionDays": 60
}
```

#### Delete Schedule
```http
DELETE /api/system-admin/backup-schedules/:id
Authorization: Bearer <super_admin_token>
```

## Using the Frontend Interface

### Accessing Backup & Recovery

1. **Login as Super Admin**
   - Role must be `super_admin`

2. **Navigate to Backup & Recovery**
   - Click **"Backup & Recovery"** in Super Admin sidebar

### Creating a Backup

1. Click **"Create Backup Now"** button
2. Backup process starts (shows spinner)
3. Backup is compressed and uploaded to R2
4. Success message appears
5. New backup appears in the list

### Downloading a Backup

1. Find the backup in the list
2. Click **"Download"** button
3. Opens signed URL in new tab (valid for 1 hour)
4. Browser downloads the `.json.gz` file

### Restoring a Backup

1. Click **"Restore"** button on desired backup
2. Confirm the restoration (⚠️ destructive action)
3. Restoration starts in background
4. May take several minutes depending on data size

### Managing Schedules

1. View existing schedules in **"Backup Schedules"** section
2. Toggle checkbox to enable/disable schedule
3. Click **"Add Schedule"** to create new automated backup
4. Configure frequency (daily/weekly/monthly) and retention period

## Backup File Structure

Each backup contains:
- **Full database export** (all collections)
- **Metadata**: timestamp, MongoDB version, document counts
- **Compression**: gzip compression for smaller file size

File format: `backup_YYYY-MM-DDTHH-MM-SS.json.gz`

Example structure:
```json
{
  "timestamp": "2024-12-04T08:00:00.000Z",
  "database": "fuel_order_db",
  "collections": {
    "users": [...],
    "deliveryorders": [...],
    "lpoentries": [...],
    "fuelrecords": [...]
  },
  "metadata": {
    "mongoVersion": "7.0.4",
    "totalCollections": 15,
    "totalDocuments": 12543
  }
}
```

## Retention Policy

- **Automated Cleanup**: Old backups are automatically deleted based on retention days
- **Default Retention**: 30 days
- **Manual Cleanup**: Use the cleanup endpoint or delete individual backups
- **Failed Backups**: Not automatically cleaned up (review and delete manually)

## Security Considerations

1. **Access Control**
   - Only `super_admin` role can access backup endpoints
   - R2 tokens should have minimal required permissions

2. **Backup Encryption**
   - R2 provides encryption at rest by default
   - Consider encrypting backup files before upload for extra security

3. **Audit Logging**
   - All backup operations are logged in audit trail
   - Track who created, downloaded, restored, or deleted backups

4. **Signed URLs**
   - Download URLs expire after 1 hour
   - URLs are single-use and cannot be reused after expiration

## Monitoring & Maintenance

### Check Backup Health
```bash
# Check latest backup
GET /api/system-admin/backups?limit=1

# Check failed backups
GET /api/system-admin/backups?status=failed

# View statistics
GET /api/system-admin/backups/stats
```

### Recommended Schedule
- **Daily backups**: 02:00 AM server time
- **Retention**: 30 days (adjust based on compliance requirements)
- **Weekly verification**: Test restore on staging environment

## Troubleshooting

### Backup Creation Fails

**Check R2 Credentials**
```bash
# Verify .env configuration
cat backend/.env | grep R2_
```

**Check Logs**
```bash
# View backend logs
tail -f backend/logs/app.log
```

**Common Issues**
- Invalid R2 credentials → Regenerate API token
- Wrong endpoint → Verify account ID in endpoint URL
- Bucket doesn't exist → Create bucket in R2 dashboard
- Insufficient permissions → Ensure token has Edit permissions

### Restore Fails

**Possible Causes**
- Corrupted backup file
- Incompatible MongoDB version
- Insufficient disk space
- Database connection issues

**Solution**
- Try downloading and inspecting backup file
- Check MongoDB version compatibility
- Verify disk space on server
- Check MongoDB connection status

## Cost Estimation

Cloudflare R2 Pricing (as of 2024):
- **Storage**: $0.015 per GB/month
- **Class A operations** (writes): $4.50 per million
- **Class B operations** (reads): $0.36 per million
- **Egress**: **FREE** (no bandwidth charges)

### Example Costs
For a 500 MB database:
- 30 daily backups = 15 GB storage
- Monthly cost: ~$0.23
- Daily backup operation: ~$0.01

**R2 is extremely cost-effective compared to S3!**

## Migration from Local Storage

If you were storing backups locally, migrate to R2:

1. Create R2 bucket and configure credentials
2. Upload existing backups to R2 manually (one-time)
3. Update system to use R2 for new backups
4. Verify backups are accessible via the interface
5. Delete local backup files after confirmation

## Next Steps

### Recommended Enhancements
- [ ] Add backup encryption before upload
- [ ] Implement incremental backups for large databases
- [ ] Add email notifications for backup success/failure
- [ ] Create backup health dashboard with charts
- [ ] Implement multi-region backup replication
- [ ] Add backup verification tests (checksum validation)

### Automation Ideas
- [ ] Cron job to trigger scheduled backups
- [ ] Automated restore testing on staging environment
- [ ] Slack/Discord notifications for backup events
- [ ] Backup size trending and alerts

## Support

For issues related to:
- **Cloudflare R2**: https://developers.cloudflare.com/r2/
- **AWS SDK**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/
- **This System**: Check backend logs and audit trail

---

**System Status**: ✅ Fully Implemented and Ready for Use
**Last Updated**: December 4, 2024
