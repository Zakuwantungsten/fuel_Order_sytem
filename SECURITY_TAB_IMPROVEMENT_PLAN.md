# Security Tab — Enterprise Upgrade Plan

## Fuel Order Management System — SuperAdmin Security Module

**Audit Date:** March 6, 2026  
**Current Components:** 11 files | ~4,000+ lines  
**Architecture:** SecurityUnifiedTab → 4 sub-tabs (Policies, Access Control, Sessions & Users, Threat Monitor)

---

## Table of Contents

1. [Current State Summary](#1-current-state-summary)
2. [Identified Gaps](#2-identified-gaps)
3. [Implementation Phases](#3-implementation-phases)
   - [Phase 1 — Security Overview & Visual Polish](#phase-1--security-overview--visual-polish-high-priority)
   - [Phase 2 — Alerts, Audit Trail & Reporting](#phase-2--alerts-audit-trail--reporting-high-priority)
   - [Phase 3 — Access Intelligence & Device Management](#phase-3--access-intelligence--device-management-medium-priority)
   - [Phase 4 — Incident Response & Compliance](#phase-4--incident-response--compliance-medium-priority)
   - [Phase 5 — Advanced Policies & Hardening](#phase-5--advanced-policies--hardening-lower-priority)
4. [Component File Map](#4-component-file-map)
5. [Enterprise Benchmark Reference](#5-enterprise-benchmark-reference)

---

## 1. Current State Summary

### What the Security Tab Already Has

| Sub-Tab | Component | Current Features |
|---|---|---|
| **Policies** | SecurityPoliciesSubTab (734 lines) | Session config (timeout, JWT expiry, max attempts, lockout), password policy (length, complexity, history), MFA enforcement (global toggle, per-role, method overrides for TOTP/Email), login security (device tracking, notifications, new device alerts), DLP rules (CRUD, toggle, stats), email notification testing |
| **Access Control** | SecurityAccessControlSubTab (165 lines) → 4 children | IP allowlist/blocklist with CIDR (IPRulesTab 649 lines), autoblock config with thresholds (SecurityBlocklistTab 721 lines), API token management with scoped permissions (ApiTokenManagerTab 204 lines), break-glass emergency accounts (BreakGlassTab 221 lines) |
| **Sessions & Users** | SecuritySessionsSubTab (412 lines) | Active sessions list (15s auto-refresh, terminate one/all), user MFA status table (search, filter, enforce/disable per user) |
| **Threat Monitor** | SecurityThreatMonitorSubTab (224 lines) → 3 children | Security score ring with 6 categories (SecurityScoreTab 244 lines), security events log with 9 event types + stats dashboard + timeline + top IPs (SecurityEventsTab 461 lines), UEBA threat detection — high-risk users, failed login clusters, off-hours activity, bulk exports, impossible travel, access anomalies, user baselines (ThreatDetectionTab 301 lines) |

### Current Strengths
- ✅ Full MFA enforcement with per-role granularity and method overrides
- ✅ UEBA-style threat detection (impossible travel, bulk exports, off-hours activity)
- ✅ IP allowlist/blocklist with CIDR support, autoblock, and IP tester
- ✅ Break-glass emergency access with auditing and password rotation
- ✅ DLP rules with configurable actions (block/warn/log)
- ✅ API token management with scoping and one-time reveal
- ✅ Real-time WebSocket sync for security setting changes
- ✅ Security score with 6-category breakdown and improvement priorities
- ✅ 9 security event types with filtering and pagination
- ✅ Autoblock with configurable thresholds (404 count, suspicious events, duration)

---

## 2. Identified Gaps

### Gap Matrix

| # | Gap | Category | Impact | Priority | Benchmarked Against |
|---|---|---|---|---|---|
| G1 | No top-level security overview dashboard | UI Layout | Admin has no at-a-glance summary of security posture | **HIGH** | Google Admin Console, Microsoft 365 Defender |
| G2 | No persistent alerts / notification center | Feature | Threats detected but no actionable alert queue | **HIGH** | Microsoft Defender Incidents, AWS Security Hub |
| G3 | No admin activity audit trail within Security tab | Feature | Can't see who changed security settings | **HIGH** | Google Admin Audit Log, AWS CloudTrail |
| G4 | No role permission matrix visualization | UI | 19 roles but no "who can do what" visibility | **HIGH** | Google Admin Roles, Okta Admin, AWS IAM |
| G5 | No security score historical trend | UI | Can't track posture improvement/decline over time | **MEDIUM** | Microsoft Secure Score trend chart |
| G6 | CSS-only charts instead of proper data visualization | UI Polish | Timeline bar chart and distributions lack interactivity | **MEDIUM** | All enterprise consoles (Datadog, Grafana, etc.) |
| G7 | No device trust & management view | Feature | Device tracking toggle exists but no device inventory | **MEDIUM** | Google Endpoint Management, Microsoft Entra Devices |
| G8 | No geographic access visualization | UI | Impossible travel shows text but no map | **MEDIUM** | Microsoft Sign-in Logs map, Cloudflare analytics |
| G9 | No conditional access policies | Feature | MFA + IP rules are disconnected — can't create compound rules | **MEDIUM** | Microsoft Entra Conditional Access, Okta Policies |
| G10 | No incident response workflow | Feature | Threats detected but no investigate → resolve lifecycle | **MEDIUM** | Microsoft Defender Incidents, AWS Security Hub |
| G11 | No export / reporting on security data | Feature | No CSV/PDF export for auditors on any Security sub-tab | **LOW-MED** | Every enterprise console |
| G12 | No compliance / regulatory mapping | Feature | Score checks exist but no framework references | **LOW-MED** | AWS Security Hub Compliance, Microsoft Compliance Manager |
| G13 | No password expiration policy management | Feature | Password policy exists but no rotation enforcement | **LOW-MED** | Google Admin, Microsoft Entra |
| G14 | No session anomaly detection | Feature | Sessions shown but no anomaly flagging (unusual browser/location) | **LOW** | Microsoft Entra Sign-in Risk |
| G15 | No keyboard shortcuts or accessibility polish | UI Polish | No ARIA labels, no keyboard navigation shortcuts | **LOW** | All enterprise consoles |
| G16 | No security policy templates / presets | Feature | All settings manual — no "Strict" / "Standard" / "Relaxed" templates | **LOW** | Google Admin Security Profiles |

### Gap Detail Descriptions

#### G1 — Security Overview Dashboard
The admin currently must navigate into each sub-tab to understand the security state. There is no persistent, always-visible summary. Google Admin Console shows a "Security Health" page; Microsoft 365 shows a "Security Dashboard" with key metrics, trends, and top recommendations — all visible before clicking anything.

#### G2 — Persistent Alerts / Notification Center
When autoblock triggers, or a UEBA anomaly fires, or a break-glass account is used — there is no persistent alert queue. Enterprise systems (Microsoft Defender, AWS Security Hub) maintain an "Incidents & Alerts" panel where admins see unresolved items, acknowledge them, and track resolution. Your current implementation uses auto-dismissing inline banners.

#### G3 — Admin Activity Audit Trail
You have AuditLogsTab at the SuperAdmin level, but the Security tab itself cannot show "Admin X changed password minimum length from 8 to 12 at 3:42 PM." Enterprise systems (Google Admin → Admin Audit Log, AWS CloudTrail) show these changes inline in the security context.

#### G4 — Role Permission Matrix
You have 19 roles used throughout the system. The MFA section shows roles as checkboxes, but there is no visual matrix showing what each role can access (fuel records, delivery orders, user management, etc.). Okta and AWS IAM provide visual permission grids that make RBAC auditing intuitive.

#### G5 — Security Score Trend
SecurityScoreTab shows the current score and checks, but no historical data. Microsoft Secure Score shows a trend line over the last 30-90 days. Admins can't tell if actions improved security posture or if regression occurred.

#### G6 — Proper Data Visualization
SecurityEventsTab uses CSS `div` bars for the timeline chart. SecurityScoreTab uses inline SVG. There are no interactive line charts, area charts, donut charts, or sparklines. Enterprise consoles use proper charting libraries for interactivity, tooltips, and zoom.

#### G7 — Device Trust & Management
You have `deviceTracking` and `newDeviceAlerts` toggles in Login Security, but no device inventory. There is no list of devices (browser + OS) that have accessed the system, no ability to trust or revoke a device. Google Admin → Device Management and Microsoft Entra → Devices both provide this.

#### G8 — Geographic Access Visualization
ThreatDetectionTab shows "impossible travel" with location text ("Dar es Salaam → Tanga → Mombasa"), but no map. Microsoft Sign-in Logs show a world/region map of authentication origins. For a fuel logistics system operating across East Africa, a regional map would be contextually valuable.

#### G9 — Conditional Access Policies
MFA enforcement is per-role. IP rules are global. There is no way to create compound rules like "if role=driver AND ip_not_in=office_range → require MFA" or "if time=outside_business_hours AND role≠super_admin → block." Microsoft Entra Conditional Access and Okta Authentication Policies allow such multi-signal rules.

#### G10 — Incident Response Workflow
Threats are detected (UEBA anomalies, security events, autoblock triggers), but the admin can only view them. There is no "New → Investigating → Resolved" lifecycle, no assignment, no notes, no linked evidence. Microsoft Defender and AWS Security Hub provide incident workflows with these capabilities.

#### G11 — Export & Reporting
No export button on any Security sub-tab. The SecurityEventsTab has pagination but no "Export all." Auditors and compliance teams need CSV/PDF reports for events, sessions, score assessments, and policy configurations.

#### G12 — Compliance & Regulatory Mapping
SecurityScoreTab has categories (authentication, access_control, monitoring, data_protection, network, compliance) with individual checks, but no mapping to actual compliance frameworks (ISO 27001, CIS Controls, Tanzania Data Protection Act). AWS Security Hub maps findings to CIS and SOC2 controls.

#### G13 — Password Expiration Policy
Password policy covers complexity and history but not **expiration** — no forced rotation interval (e.g., 90-day password expiry), no "password age" tracking, no grace period before lockout.

#### G14 — Session Anomaly Detection
Active sessions are listed with IP and user-agent, but there is no flagging of anomalous sessions (new device type, unusual IP, session from a different country than usual). Microsoft Entra flags "risky sign-ins" automatically.

#### G15 — Keyboard Shortcuts & Accessibility
No visible ARIA attributes, no keyboard shortcuts for common actions (R=refresh, 1-4=switch tabs), no skip-to-content landmarks, no focus trapping in modals.

#### G16 — Security Policy Templates
All security settings are manual. Enterprise consoles offer preset templates ("Strict / Enterprise," "Standard / Balanced," "Relaxed / Developer") that set all security parameters at once.

---

## 3. Implementation Phases

### Phase 1 — Security Overview & Visual Polish (HIGH Priority)

**Goal:** Give admins an immediate, at-a-glance security posture summary and upgrade the visual quality to enterprise grade.

**Gaps Addressed:** G1, G5, G6

#### 1.1 — Security Overview Dashboard Banner

**Add a persistent overview section** at the top of `SecurityUnifiedTab`, above the sub-tab navigation.

```
┌─────────────────────────────────────────────────────────────────┐
│  🛡 Security Overview                                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Score: 78 │  │ Threat:  │  │ Active   │  │ Unresolved   │   │
│  │  ◯ ring   │  │ MEDIUM   │  │ Sessions │  │ Alerts: 3    │   │
│  │  Grade B  │  │ ▲ badge  │  │ 12       │  │ ⚠ badge      │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                 │
│  ┌─ Score Trend (30d) ─────────────────────────────────────┐   │
│  │  ╭─╮    ╭──╮       ╭────╮                               │   │
│  │ ╭╯ ╰──╮╯  ╰╮  ╭──╯    ╰──╮ ╭───                       │   │
│  │╯      ╰    ╰──╯          ╰─╯                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ⚠ 3 items need attention:                                     │
│  • Password policy below recommended minimum (Score: -8)        │
│  • 2 users have MFA disabled in mandatory roles                 │
│  • Break-glass account "emergency-admin" is enabled             │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **New file:** `SecurityOverviewBanner.tsx`
- Fetches security score, threat level, session count, alert count on mount
- Renders 4 stat cards in a horizontal row
- "Items need attention" pulled from `improvementPriority` in security score API
- Score trend chart: new API endpoint `GET /system-admin/security-score/history?days=30`

**Backend work:**
- New model/collection: `SecurityScoreHistory` — daily snapshots of `overallScore`
- Cron job or hook in security-score calculation to store daily snapshot
- New endpoint: `GET /system-admin/security-score/history`

#### 1.2 — Recharts Integration for Data Visualization

**Replace CSS-only charts** with interactive Recharts components.

**Affected files:**
- `SecurityEventsTab.tsx` — timeline bar chart → `<AreaChart>` with tooltips
- `SecurityScoreTab.tsx` — add `<LineChart>` for score trend
- `SecurityThreatMonitorSubTab.tsx` — event type distribution → `<PieChart>` or `<BarChart>`
- `SecurityOverviewBanner.tsx` — score trend → `<AreaChart>` sparkline

**Implementation:**
- `npm install recharts` (already common for React, tree-shakeable)
- Create shared chart theme component for consistent colors across dark/light mode
- **New file:** `SecurityCharts.tsx` — reusable chart wrappers (TrendChart, DistributionChart, TimelineChart)

#### 1.3 — Security Score Trend History

**Add historical data to SecurityScoreTab:**
- Time range selector (7d / 30d / 90d)
- `<LineChart>` showing score over time
- Milestone markers (e.g., "MFA enabled", "Password policy updated")

**Implementation:**
- Extend SecurityScoreTab with trend section above the score ring
- Backend: `SecurityScoreSnapshot` model with `{ date, score, categoryScores }` stored daily

---

### Phase 2 — Alerts, Audit Trail & Reporting (HIGH Priority)

**Goal:** Give admins a persistent, actionable alert queue, visible audit trail of security changes, and exportable reports.

**Gaps Addressed:** G2, G3, G11

#### 2.1 — Security Alerts Panel

**New sub-tab: "Alerts"** (or badge integrated into Threat Monitor).

```
┌─────────────────────────────────────────────────────────────────┐
│  🔔 Security Alerts                          [Filter ▾] [⟳]   │
│                                                                 │
│  ┌─ CRITICAL ─────────────────────────────────────────────┐    │
│  │ 🔴 Break-glass account "emergency-admin" activated      │    │
│  │    Mar 5, 2026 at 11:32 PM · IP: 192.168.1.42          │    │
│  │    [Investigate] [Acknowledge] [Dismiss]                │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─ HIGH ─────────────────────────────────────────────────┐    │
│  │ 🟠 Impossible travel detected for user "john.driver"    │    │
│  │    Mar 5, 2026 at 3:15 PM · Dar es Salaam → Mombasa    │    │
│  │    [Investigate] [Acknowledge] [Mark False Positive]    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─ MEDIUM ───────────────────────────────────────────────┐    │
│  │ 🟡 5 failed login attempts from IP 10.0.0.55           │    │
│  │    Mar 5, 2026 at 2:48 PM · Auto-blocked for 30min     │    │
│  │    [View Details] [Acknowledge]                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Showing 3 unresolved alerts  ·  12 resolved today             │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **New file:** `SecurityAlertsSubTab.tsx`
- **Backend model:** `SecurityAlert` — `{ severity, type, title, message, metadata, status (new|acknowledged|investigating|resolved|false_positive), createdAt, acknowledgedBy, resolvedAt, notes[] }`
- **Backend endpoints:**
  - `GET /system-admin/security-alerts?status=&severity=&page=&limit=`
  - `PATCH /system-admin/security-alerts/:id/acknowledge`
  - `PATCH /system-admin/security-alerts/:id/resolve`
  - `PATCH /system-admin/security-alerts/:id/note` — add investigation note
- **Alert generation:** Hook into existing event pipeline — when security events, UEBA anomalies, break-glass activations, or autoblock triggers fire, auto-create a SecurityAlert
- **Badge:** Show unresolved alert count on the sub-tab pill and on the overview banner
- Add "Alerts" as 5th sub-tab in `SecurityUnifiedTab`

#### 2.2 — Admin Security Change Log

**Add a "Recent Changes" section** at the bottom of the Policies sub-tab (or as a collapsible panel).

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Recent Security Changes                    [View All →]    │
│                                                                 │
│  • admin@fuel.co changed Password Min Length: 8 → 12           │
│    Mar 5, 2026 at 4:12 PM                                      │
│                                                                 │
│  • super@fuel.co enabled MFA for role "driver"                 │
│    Mar 5, 2026 at 3:55 PM                                      │
│                                                                 │
│  • admin@fuel.co created DLP rule "Export Limit — Fuel"        │
│    Mar 4, 2026 at 11:20 AM                                     │
│                                                                 │
│  • super@fuel.co updated Session Timeout: 30 → 15 min         │
│    Mar 3, 2026 at 9:05 AM                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Query existing `AuditLog` model filtered to security-related actions (security_settings_update, mfa_*, dlp_*, ip_rule_*, api_token_*, break_glass_*)
- **New file:** `SecurityChangeLog.tsx` — small component fetching recent audit entries
- **New endpoint:** `GET /system-admin/security-audit-log?limit=10` (filtered audit log)
- Embedded in SecurityPoliciesSubTab as a collapsible section

#### 2.3 — Security Data Export

**Add export buttons** to Security Events, Sessions, and Score tabs.

**Implementation:**
- **New file:** `useSecurityExport.ts` — custom hook with `exportCSV()` and `exportPDF()` methods
- Add "Export" dropdown button (CSV / PDF) to:
  - SecurityEventsTab header
  - SecuritySessionsSubTab header
  - SecurityScoreTab header
  - SecurityBlocklistTab header
- CSV: client-side generation using existing data
- PDF: client-side generation using a lightweight library (jspdf + jspdf-autotable) or server-side endpoint
- **New endpoints (optional, for full data):**
  - `GET /system-admin/security-events/export?format=csv&hours=24`
  - `GET /system-admin/security-score/report?format=pdf`

---

### Phase 3 — Access Intelligence & Device Management (MEDIUM Priority)

**Goal:** Add device visibility, geographic context, and role permission clarity.

**Gaps Addressed:** G4, G7, G8, G14

#### 3.1 — Role Permission Matrix

**New section** in Access Control sub-tab or as its own view.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Role Permission Matrix                                [Export]    │
│                                                                     │
│  Role              │ Fuel │ Delivery │ LPO  │ Users │ Audit │ Yard │
│  ──────────────────┼──────┼──────────┼──────┼───────┼───────┼──────│
│  super_admin       │ CRUD │ CRUD     │ CRUD │ CRUD  │ R     │ CRUD │
│  admin             │ CRUD │ CRUD     │ CRUD │ CRU   │ R     │ CRUD │
│  manager           │ CRU  │ CRU     │ CRU  │ R     │ R     │ CR   │
│  supervisor        │ CR   │ CR      │ CR   │ —     │ —     │ CR   │
│  driver            │ R    │ R       │ —    │ —     │ —     │ —    │
│  clerk             │ CRU  │ CRU     │ CRU  │ —     │ —     │ —    │
│  viewer            │ R    │ R       │ R    │ —     │ R     │ R    │
│  ...               │      │         │      │       │       │      │
│  ──────────────────┴──────┴──────────┴──────┴───────┴───────┴──────│
│  C = Create  R = Read  U = Update  D = Delete  — = No Access      │
└─────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **New file:** `RolePermissionMatrix.tsx`
- **Backend endpoint:** `GET /system-admin/role-permissions` — returns structured permission map
- Parse from existing `authorize()` middleware route definitions
- Interactive: click a cell to see which routes/endpoints that role can access
- Color-coded: green (full), yellow (partial), red (none)

#### 3.2 — Device Trust & Management

**New panel** inside Sessions & Users sub-tab.

```
┌─────────────────────────────────────────────────────────────────┐
│  📱 Known Devices                      [Search] [Filter ▾] [⟳] │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🖥 Chrome 120 · Windows 11       ✅ Trusted             │   │
│  │   User: admin@fuel.co · Last seen: 2 hours ago          │   │
│  │   IP: 192.168.1.10 · Sessions: 3                        │   │
│  │   First seen: Jan 15, 2026                  [Revoke]    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 📱 Safari · iOS 18              ⚠️ New Device            │   │
│  │   User: driver@fuel.co · Last seen: 30 min ago          │   │
│  │   IP: 10.0.0.55 · Sessions: 1                           │   │
│  │   First seen: Today              [Trust] [Block]        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **Backend model:** `KnownDevice` — `{ userId, deviceFingerprint, userAgent, browser, os, firstSeen, lastSeen, trusted, blocked, sessionCount }`
- **Backend endpoints:**
  - `GET /system-admin/devices?userId=&trusted=`
  - `PATCH /system-admin/devices/:id/trust`
  - `PATCH /system-admin/devices/:id/block`
  - `DELETE /system-admin/devices/:id`  
- **Frontend file:** `DeviceManagementPanel.tsx`
- Parse User-Agent into browser + OS via `ua-parser-js`
- Integrate with existing `deviceTracking` toggle — when enabled, devices are recorded
- Show device count in session stat cards

#### 3.3 — Geographic Access Map

**Add a map visualization** to the Threat Monitor overview.

```
┌─────────────────────────────────────────────────────────────────┐
│  🗺 Login Geography (Last 7 Days)                               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │          ● Dar es Salaam (42 logins)                     │   │
│  │                                                         │   │
│  │     ● Tanga (12 logins)                                 │   │
│  │                                                         │   │
│  │  ● Mombasa (3 logins)  ⚠ unusual                       │   │
│  │                                                         │   │
│  │              [East Africa Regional Map SVG]             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Top Locations:                                                 │
│  1. Dar es Salaam — 42 logins · 8 users                        │
│  2. Tanga — 12 logins · 3 users                                │
│  3. Mombasa — 3 logins · 1 user ⚠                              │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **New file:** `GeoAccessMap.tsx`
- Lightweight SVG-based map (no heavy map library — use a static East Africa SVG with plotted points)
- **Backend endpoint:** `GET /system-admin/login-geography?days=7`
- Aggregate login locations from session/audit data (IP → geolocation via existing data or `geoip-lite`)
- Flag locations outside normal operating regions
- Integrate into ThreatDetectionTab or SecurityThreatMonitorSubTab overview

#### 3.4 — Session Anomaly Detection

**Flag suspicious sessions** in the existing sessions list.

**Implementation:**
- Modify `SecuritySessionsSubTab.tsx` — add anomaly indicators to session cards
- Anomaly signals: new device type, unusual IP range, different country than user's last 5 logins, login during off-hours for that user's role
- **Backend:** Extend session data with `riskScore` and `anomalyReasons[]` fields
- Visual: amber border + "⚠ Unusual" badge on anomalous sessions
- Filter option: "Show risky sessions only"

---

### Phase 4 — Incident Response & Compliance (MEDIUM Priority)

**Goal:** Turn threat detections into actionable incidents with lifecycle tracking, and map security against compliance standards.

**Gaps Addressed:** G10, G12

#### 4.1 — Security Incident Workflow

**New section** in Threat Monitor or as enhancement to Security Alerts.

```
┌─────────────────────────────────────────────────────────────────┐
│  🚨 Security Incidents                [New Incident] [Filter]  │
│                                                                 │
│  ┌─ INC-2026-0042 ────────────────────────────────────────┐    │
│  │ 🔴 CRITICAL · Investigating                            │    │
│  │ "Multiple failed logins followed by break-glass use"   │    │
│  │                                                         │    │
│  │ Created: Mar 5, 2026 · Assigned: admin@fuel.co          │    │
│  │ Linked: 3 security events, 1 alert                      │    │
│  │                                                         │    │
│  │ Timeline:                                               │    │
│  │ • 11:42 PM — Incident auto-created from alert           │    │
│  │ • 11:45 PM — admin@fuel.co acknowledged                 │    │
│  │ • 11:50 PM — Note: "Checking with night shift team"     │    │
│  │                                                         │    │
│  │ [Add Note] [Link Event] [Resolve] [Escalate]            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Stats: 1 open · 5 resolved this week · MTTR: 2.3 hours       │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **Backend model:** `SecurityIncident` — `{ incidentId, severity, status (new|acknowledged|investigating|resolved|false_positive|escalated), title, description, assignedTo, linkedAlerts[], linkedEvents[], notes[{author, text, timestamp}], createdAt, resolvedAt }`
- **Backend endpoints:**
  - `GET /system-admin/incidents?status=&severity=&page=`
  - `POST /system-admin/incidents` — create manually
  - `PATCH /system-admin/incidents/:id` — update status/assignment
  - `POST /system-admin/incidents/:id/note` — add investigation note
  - `POST /system-admin/incidents/:id/link` — link alert/event
  - `GET /system-admin/incidents/stats` — MTTR, open count
- **Frontend file:** `SecurityIncidentPanel.tsx`
- Auto-create incidents from critical alerts
- Track Mean Time to Resolve (MTTR)

#### 4.2 — Compliance & Regulatory Dashboard

**New section** in Security Score or as separate view.

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Compliance Status                                          │
│                                                                 │
│  ┌─ Internal Security Policy ─────────── 87% compliant ───┐   │
│  │ ✅ Password complexity enforced                          │   │
│  │ ✅ MFA enabled for admin roles                           │   │
│  │ ⚠️ Session timeout > 15 min (current: 30)               │   │
│  │ ❌ No password expiration policy                         │   │
│  │ ✅ Audit logging enabled                                 │   │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─ Data Protection (General) ─────────── 72% compliant ──┐   │
│  │ ✅ Data export controls (DLP) configured                 │   │
│  │ ✅ Access logging enabled                                │   │
│  │ ⚠️ No data retention policy configured                  │   │
│  │ ❌ No encryption at rest verification                    │   │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─ Operational Security ──────────────── 91% compliant ──┐   │
│  │ ✅ IP blocking enabled                                   │   │
│  │ ✅ Rate limiting configured                              │   │
│  │ ✅ CSRF protection active                                │   │
│  │ ✅ Security monitoring enabled                           │   │
│  │ ⚠️ Break-glass account is enabled                       │   │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **New file:** `ComplianceDashboard.tsx`
- Map existing security score checks to compliance categories relevant to Tanzanian fuel industry:
  - Internal Security Policy
  - Data Protection
  - Operational Security
  - Access Management
- Generate from existing security score data — no new API needed, just a transformed view
- Show percentage compliance per framework
- Actionable recommendations with "Fix" links that navigate to the relevant setting

---

### Phase 5 — Advanced Policies & Hardening (LOWER Priority)

**Goal:** Add compound policy rules, password expiration, templates, and accessibility.

**Gaps Addressed:** G9, G13, G15, G16

#### 5.1 — Conditional Access Policies

**New section** in Policies or Access Control.

```
┌─────────────────────────────────────────────────────────────────┐
│  🔐 Conditional Access Policies              [+ New Policy]    │
│                                                                 │
│  ┌─ Policy: "Require MFA outside office" ──── Active ──────┐  │
│  │ IF  role ∈ [driver, clerk, yard_personnel]               │  │
│  │ AND ip NOT IN 192.168.1.0/24                             │  │
│  │ THEN require MFA                                         │  │
│  │                                              [Edit] [⏸] │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Policy: "Block off-hours admin access" ──── Active ──── │  │
│  │ IF  role ∈ [admin, super_admin]                          │  │
│  │ AND time NOT BETWEEN 06:00–22:00 EAT                     │  │
│  │ THEN block + notify                                      │  │
│  │                                              [Edit] [⏸] │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **Backend model:** `ConditionalAccessPolicy` — `{ name, conditions[{signal, operator, value}], action (allow|block|require_mfa|notify), isActive, priority }`
- **Signals:** role, ip_range, time_of_day, device_trusted, country, login_risk_score
- **Actions:** allow, block, require_mfa, step_up_auth, notify_admin
- **Backend middleware:** Evaluate policies on authentication and on sensitive operations
- **Frontend file:** `ConditionalAccessPolicies.tsx` — policy builder with visual rule composer
- **Backend endpoints:**
  - `GET /system-admin/conditional-access`
  - `POST /system-admin/conditional-access`
  - `PUT /system-admin/conditional-access/:id`
  - `DELETE /system-admin/conditional-access/:id`

#### 5.2 — Password Expiration Policy

**Add to existing password policy section** in SecurityPoliciesSubTab.

**New fields:**
- Password expiration interval (days): 0 = never, 30/60/90/180/365
- Grace period before lockout (days)
- Notification before expiry (days)
- Exempt roles (e.g., service accounts)

**Implementation:**
- Extend `DEFAULT_PASSWORD` with `expirationDays`, `gracePeriod`, `notifyBeforeExpiry`, `exemptRoles`
- Backend: Add password age check to auth middleware — if expired, force password change flow
- Backend: Cron job for email notifications before expiry

#### 5.3 — Security Policy Templates

**Add template selector** to the top of Policies sub-tab.

```
┌─────────────────────────────────────────────────────────────────┐
│  📑 Security Templates                                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 🔒 Strict │  │ ⚖ Standard│  │ 🔓 Relaxed│  │ ⚙ Custom    │  │
│  │ (Current) │  │          │  │          │  │ (Modified)   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │
│                                                                 │
│  Strict: 15min timeout, 16-char passwords, MFA required for    │
│  all roles, 3 max attempts, 30min lockout                      │
│                                                                 │
│  [Apply Template]  [Compare with Current]                       │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- **New file:** `SecurityTemplates.tsx`
- Predefined template objects: `STRICT`, `STANDARD`, `RELAXED`
- "Compare" view: side-by-side diff of template vs current settings
- "Apply" button: batch-updates all settings with confirmation modal
- Template definitions:

| Setting | Strict | Standard | Relaxed |
|---|---|---|---|
| Session Timeout | 15 min | 30 min | 60 min |
| Password Min Length | 16 | 12 | 8 |
| Max Login Attempts | 3 | 5 | 10 |
| Lockout Duration | 30 min | 15 min | 5 min |
| MFA Required | All roles | Admin roles | None |
| Password History | 10 | 5 | 3 |
| Allow Multiple Sessions | No | Yes | Yes |

#### 5.4 — Accessibility & Keyboard Shortcuts

**Implementation:**
- Add `aria-label` attributes to all interactive elements across all 11 security components
- Add keyboard shortcuts overlay (press `?` to show):
  - `R` — Refresh current tab
  - `1-5` — Switch sub-tabs
  - `Esc` — Close modals
  - `/` — Focus search input
- Add focus trapping in modals (BreakGlassTab, IPRulesTab slide-over, ConfirmModal)
- Add skip-to-content landmark at Security tab level
- Ensure color-coded severity badges also have text labels (not color-only)

---

## 4. Component File Map

### Current Files (11)

| File | Lines | Sub-Tab | Role |
|---|---|---|---|
| SecurityUnifiedTab.tsx | 65 | — | Top-level orchestrator, sub-tab navigation |
| SecurityPoliciesSubTab.tsx | 734 | Policies | Session, password, MFA, DLP, login security, email |
| SecurityAccessControlSubTab.tsx | 165 | Access Control | Orchestrator for IP, tokens, break-glass |
| IPRulesTab.tsx | 649 | Access Control | IP allowlist/blocklist CRUD |
| SecurityBlocklistTab.tsx | 721 | Access Control | Auto-blocked IPs, suspicious IPs, autoblock config |
| ApiTokenManagerTab.tsx | 204 | Access Control | API token CRUD with scoped permissions  |
| BreakGlassTab.tsx | 221 | Access Control | Emergency access accounts |
| SecuritySessionsSubTab.tsx | 412 | Sessions | Active sessions, user MFA status |
| SecurityThreatMonitorSubTab.tsx | 224 | Threat Monitor | Orchestrator for events, threats, score |
| SecurityEventsTab.tsx | 461 | Threat Monitor | Security event log with stats |
| ThreatDetectionTab.tsx | 301 | Threat Monitor | UEBA anomaly detection |
| SecurityScoreTab.tsx | 244 | Threat Monitor | Security posture scoring |

### New Files to Create (by phase)

| Phase | File | Purpose |
|---|---|---|
| 1 | SecurityOverviewBanner.tsx | Always-visible security posture summary |
| 1 | SecurityCharts.tsx | Reusable Recharts wrappers (trend, distribution, timeline) |
| 2 | SecurityAlertsSubTab.tsx | Persistent alert queue with acknowledge/resolve workflow |
| 2 | SecurityChangeLog.tsx | Recent admin security setting changes |
| 2 | useSecurityExport.ts | CSV/PDF export hook for security data |
| 3 | RolePermissionMatrix.tsx | Visual role × capability grid |
| 3 | DeviceManagementPanel.tsx | Device inventory with trust/block |
| 3 | GeoAccessMap.tsx | SVG map of login locations |
| 4 | SecurityIncidentPanel.tsx | Incident lifecycle (create → investigate → resolve) |
| 4 | ComplianceDashboard.tsx | Compliance framework mapping |
| 5 | ConditionalAccessPolicies.tsx | Compound rule builder (role + IP + time → action) |
| 5 | SecurityTemplates.tsx | Preset security policy templates |

### Updated Sub-Tab Structure (Post All Phases)

```
SecurityUnifiedTab
├── [SecurityOverviewBanner — always visible at top]
│
├── Policies sub-tab
│   ├── SecurityTemplates (template selector bar)
│   ├── Session & Security (collapsible)
│   ├── Password Policy (collapsible) — with expiration fields
│   ├── MFA Enforcement (collapsible)
│   ├── Login Security (collapsible)
│   ├── Data Loss Prevention (collapsible)
│   ├── Conditional Access Policies (collapsible)
│   ├── Email Notifications (collapsible)
│   └── SecurityChangeLog (collapsible)
│
├── Access Control sub-tab
│   ├── Overview stat cards
│   ├── IP Management (IPRulesTab / SecurityBlocklistTab)
│   ├── API Tokens (ApiTokenManagerTab)
│   ├── Emergency Access (BreakGlassTab)
│   └── Role Permissions (RolePermissionMatrix)
│
├── Sessions & Users sub-tab
│   ├── Stat cards (with anomaly count)
│   ├── Active Sessions (with anomaly badges)
│   ├── User MFA Status
│   └── Known Devices (DeviceManagementPanel)
│
├── Threat Monitor sub-tab
│   ├── Overview (with GeoAccessMap)
│   ├── Security Events (SecurityEventsTab — with Recharts)
│   ├── Threat Detection (ThreatDetectionTab)
│   ├── Security Score (SecurityScoreTab — with trend chart)
│   └── Compliance (ComplianceDashboard)
│
└── Alerts sub-tab (NEW — 5th tab)
    ├── Alert queue (SecurityAlertsSubTab)
    └── Incidents (SecurityIncidentPanel)
```

---

## 5. Enterprise Benchmark Reference

### Platforms Studied

| Platform | Key Security UI Features |
|---|---|
| **Google Admin Console** | Security Health page with score + recommendations, Admin audit log, Device management, Login geography, Role privilege viewer, 2-Step Verification enforcement, App access control, Security Investigation Tool |
| **Microsoft 365 Defender / Entra** | Secure Score with trend over time, Conditional Access policy builder, Sign-in logs with risk levels + map, Incidents & Alerts queue with lifecycle, Device compliance, Identity Protection (risky users/sign-ins), Privileged Identity Management |
| **AWS IAM / Security Hub** | Security Hub dashboard with compliance mapping (CIS, SOC2), IAM Access Analyzer, CloudTrail event history, Findings with workflow states, GuardDuty threat detection, Trusted Advisor security checks |
| **Okta Admin** | System Log with real-time streaming, Authentication Policies (conditional), Factor enrollment management, Session management, Network Zones (IP-based policies), ThreatInsight (rate limiting + IP blocking), Admin activity log |
| **Cloudflare Zero Trust** | Device posture checks, Access policies (compound rules), Geographic restrictions, Risk score per user, Audit logs with export, Session management, DNS-level threat blocking |
| **Datadog Security** | Real-time threat detection, SIEM metrics with charts, Cloud Security Posture Management (CSPM), Compliance frameworks, Findings with automated remediation, Alert rules with notification channels |

### What Your System Will Match After All Phases

| Capability | Google | Microsoft | AWS | Okta | **Your System** |
|---|---|---|---|---|---|
| Security Score | ✅ | ✅ | ✅ | — | ✅ (current) |
| Score Trend | — | ✅ | — | — | ✅ (Phase 1) |
| Alert Queue | — | ✅ | ✅ | — | ✅ (Phase 2) |
| Admin Audit | ✅ | ✅ | ✅ | ✅ | ✅ (Phase 2) |
| IP Rules | — | — | ✅ | ✅ | ✅ (current) |
| MFA Enforcement | ✅ | ✅ | ✅ | ✅ | ✅ (current) |
| DLP Controls | ✅ | ✅ | — | — | ✅ (current) |
| Threat Detection (UEBA) | — | ✅ | ✅ | ✅ | ✅ (current) |
| Device Management | ✅ | ✅ | — | — | ✅ (Phase 3) |
| Role Permission Matrix | ✅ | ✅ | ✅ | ✅ | ✅ (Phase 3) |
| Login Geography Map | ✅ | ✅ | — | — | ✅ (Phase 3) |
| Conditional Access | — | ✅ | ✅ | ✅ | ✅ (Phase 5) |
| Incident Workflow | — | ✅ | ✅ | — | ✅ (Phase 4) |
| Compliance Mapping | — | ✅ | ✅ | — | ✅ (Phase 4) |
| API Tokens | — | ✅ | ✅ | ✅ | ✅ (current) |
| Break-Glass Access | — | ✅ | — | — | ✅ (current) |
| Data Export | ✅ | ✅ | ✅ | ✅ | ✅ (Phase 2) |
| Security Templates | ✅ | — | — | — | ✅ (Phase 5) |
| Interactive Charts | ✅ | ✅ | ✅ | ✅ | ✅ (Phase 1) |

---

*End of Security Tab Enterprise Upgrade Plan*
