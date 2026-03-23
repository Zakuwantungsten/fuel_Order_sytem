# Super Admin Settings Consolidation: Detailed Implementation Phases

Date: 2026-03-23  
Project: Fuel Order Super Admin Module  
Source baseline: SUPERADMIN_SETTINGS_AND_LOADING_AUDIT.md

## 1. Purpose

This document turns the audit findings into an execution-ready, phase-by-phase plan with practical implementation steps for frontend and backend, plus testing, risk controls, and release gates.

It assumes the loading-system unification work has already been implemented, and focuses primarily on the remaining consolidation and governance problems.

## 2. Delivery Principles

1. One editable owner per settings domain.
2. Keep migrations backward-compatible during rollout windows.
3. Remove dead paths only after parity checks and route verification.
4. Ship in small increments with measurable acceptance criteria.
5. Pair every UI ownership change with schema and endpoint clarity.

## 3. Implementation Roadmap (Sequenced)

1. Phase 0: Baseline and Guardrails
2. Phase 1: Loading Standard Foundation (validation and hardening only)
3. Phase 1.5: Uniform Loader Rollout Validation (closeout only)
4. Phase 2: Security Domain Consolidation
5. Phase 3: Data Lifecycle Consolidation
6. Phase 4: Alerts and Notification Consolidation
7. Phase 5: Legacy Component Decommission
8. Phase 6: UX and Information Architecture Polish
9. Phase 7: Hardening, Release, and Post-Release Monitoring

---

## Phase 0: Baseline and Guardrails

### Objective
Create governance and observability foundations so each setting key has clear ownership and all future changes can be validated against a known baseline.

### Problems Addressed
1. No enforceable owner mapping for settings keys.
2. High risk of duplicate write paths reappearing.
3. Weak measurement of save/load reliability.

### Frontend Implementation Steps
1. Add settings telemetry wrapper for all save actions:
- Track setting domain, key, action result, duration, requestId.
2. Add load-duration instrumentation for key Super Admin tabs.
3. Build a lint-style script to detect anti-patterns:
- Duplicate editor hints for same key.
- Ad-hoc loading pattern usage in Super Admin scope.
4. Add CI check to run the script on pull requests affecting Super Admin.

### Backend Implementation Steps
1. Add settings-domain metadata endpoint:
- Returns setting key -> owner domain mapping.
2. Standardize settings response envelope:
- success, message, data, requestId, servedAt, validationErrors.
3. Add server-side guardrails:
- Reject writes for unknown keys or ambiguous owner mapping.

### Deliverables
1. Domain owner registry.
2. Telemetry event schema and dashboards.
3. CI policy checks for Super Admin settings ownership and loading anti-patterns.

### Testing
1. Unit tests for owner-mapping resolver.
2. Integration tests for metadata endpoint and response envelope shape.
3. Frontend tests verifying telemetry emission on save success/failure.

### Risks and Mitigation
1. Risk: false positives in lint rules.
- Mitigation: start in warning mode for one sprint, then enforce.
2. Risk: legacy endpoints not conforming to envelope.
- Mitigation: add compatibility adapter.

### Exit Criteria
1. Every settings key mapped to a single owner domain.
2. Telemetry visible for save actions and load durations.
3. CI guardrails active.

### Estimated Effort
3 to 5 days.

---

## Phase 1: Loading Standard Foundation (Validation and Hardening)

### Objective
Validate and harden the shared loading primitives you already unified, ensuring consistency and reliability under real workflows.

### Problems Addressed
1. Potential drift between shared loading components and edge-case tabs.
2. Inconsistent pending/error handling around save actions.

### Frontend Implementation Steps
1. Confirm all Super Admin tabs consume only shared loading components.
2. Standardize action-pending behavior:
- Button disabled state.
- Spinner size and alignment.
- Consistent pending labels.
3. Add standardized error+retry panel for failed loads.
4. Add shared hook contracts:
- useAsyncState (idle/loading/success/error)
- useActionState (idle/pending/success/error)
5. Ensure User Management exception remains skeleton-first where intended.

### Backend Implementation Steps
1. Ensure endpoints return actionable error metadata for retry surfaces.
2. Add requestId and servedAt consistently (if not already present).

### Deliverables
1. Verified loading-state consistency report.
2. Shared pending/error semantics applied across Super Admin tabs.

### Testing
1. Visual regression tests for loading, error, retry states.
2. Interaction tests for save buttons (pending, disabled, resolved).

### Risks and Mitigation
1. Risk: minor UX regressions from standardized wrappers.
- Mitigation: visual snapshots and focused QA matrix.

### Exit Criteria
1. No bespoke full-page loader markup in Super Admin.
2. Consistent pending and retry interactions across tabs.

### Estimated Effort
2 to 4 days.

---

## Phase 1.5: Uniform Loader Rollout Closeout

### Objective
Close any residual inconsistencies after unification and lock the standard with enforcement.

### Problems Addressed
1. New ad-hoc patterns introduced by future PRs.
2. Hidden one-off loader implementations outside obvious routes.

### Frontend Implementation Steps
1. Run codebase scan and replace residual one-off loader blocks.
2. Enforce lint rule to block loader anti-patterns in Super Admin.
3. Document approved loading components and usage examples.

### Backend Implementation Steps
1. Optional performance headers/metadata for loading diagnostics.

### Deliverables
1. Loader enforcement docs and CI rule.
2. Clean scan report with zero policy violations.

### Testing
1. CI lint pass required for merge.
2. Spot-check manual QA for high-traffic tabs.

### Exit Criteria
1. Enforcement active.
2. No policy violations in Super Admin scope.

### Estimated Effort
1 to 2 days.

---

## Phase 2: Security Domain Consolidation

### Objective
Make Security Center the only editable authority for security policy and session controls.

### Problems Addressed
1. Duplicate security edit points between System Config and Security Center.
2. Contradictory policy updates and admin confusion.

### Frontend Implementation Steps
1. Remove editable security controls from System Config surfaces.
2. Add read-only security summary cards in System Config:
- Current policy values.
- Last changed by/when.
- Deep-link to Security Center editor.
3. Keep all policy editing in security-owned tabs only.
4. Add route-level breadcrumbs and ownership labels:
- "Managed in Security Center".

### Backend Implementation Steps
1. Consolidate security policy write paths into canonical endpoints.
2. Normalize validation errors for password, MFA, session, access-control updates.
3. Add optimistic concurrency controls (version or etag) for policy writes.

### Data/API Contract Changes
1. Security policy payload versioning.
2. Canonical error structure for field-level validation.

### Migration Plan
1. Mark old security write endpoints as deprecated.
2. Redirect legacy writes through compatibility adapter.
3. Remove deprecated routes after one release window.

### Testing
1. E2E: edit security policy only from Security Center.
2. E2E: System Config shows summary, cannot edit.
3. Integration: deprecation adapter forwards correctly.

### Risks and Mitigation
1. Risk: hidden consumers still calling old endpoints.
- Mitigation: server logs + temporary adapter metrics.

### Exit Criteria
1. One editable owner for each security policy family.
2. System Config security section is read-only and linked.

### Estimated Effort
4 to 7 days.

---

## Phase 3: Data Lifecycle Consolidation

### Objective
Create one canonical editor for retention and lifecycle policy while keeping operational tabs focused on execution/history.

### Problems Addressed
1. Retention policy duplication across System, Archival, Trash, and Backup.
2. Policy drift caused by multiple competing edit screens.

### Frontend Implementation Steps
1. Implement Data Lifecycle Policy editor as the only write surface for:
- Retention windows.
- Archival thresholds.
- Trash retention and purge cadence.
- Backup retention contract.
2. Remove policy-edit controls from operational tabs.
3. Add read-only lifecycle summary cards in operational tabs with deep-links.
4. Add impact labels and confirmations for high-risk lifecycle changes.

### Backend Implementation Steps
1. Create unified lifecycle policy endpoint or facade.
2. Map legacy keys to canonical schema.
3. Add schema validation with explicit constraints and safe defaults.
4. Add migration scripts for existing tenant/system settings.

### Data/API Contract Changes
1. Canonical data lifecycle schema.
2. Versioned write contract with migration compatibility.

### Migration Plan
1. Read from canonical schema, write-through to old keys during transition.
2. Monitor parity for one release cycle.
3. Remove dual-write after parity confirmed.

### Testing
1. Integration tests for schema mapping and adapter behavior.
2. E2E tests across lifecycle editor and operational tabs.
3. Regression tests for archival/trash/backup jobs using new policy source.

### Risks and Mitigation
1. Risk: job schedulers still reading legacy keys.
- Mitigation: temporary dual-read fallback and metric alarms.

### Exit Criteria
1. One policy editor for lifecycle settings.
2. Operational tabs no longer provide lifecycle policy writes.

### Estimated Effort
6 to 10 days.

---

## Phase 4: Alerts and Notification Consolidation

### Objective
Unify alert thresholds, routing, channels, and recipients under Monitoring and Alerts as one policy owner.

### Problems Addressed
1. Alerting logic split across System, thresholds, notification config, and monitoring areas.
2. Inconsistent trigger/routing definitions.

### Frontend Implementation Steps
1. Move all alert policy editing to Monitoring and Alerts owner screens.
2. Convert System alert sections to health summary and references only.
3. Build unified alert policy form sections:
- Trigger thresholds.
- Recipient routing.
- Channel rules.
- Digest/noise controls.
4. Add conflict detection UI for incompatible routing settings.

### Backend Implementation Steps
1. Consolidate alert and notification schemas.
2. Add migration layer for old key families.
3. Add strict schema validation and normalization.
4. Add dry-run endpoint for threshold/routing validation (optional but recommended).

### Data/API Contract Changes
1. Unified alert policy schema.
2. Consistent endpoint family for alerts and notifications.

### Migration Plan
1. Migrate existing alert keys to canonical schema.
2. Keep read adapters for legacy keys during grace period.
3. Remove old write paths after validated parity.

### Testing
1. E2E tests for threshold + recipient + channel updates.
2. Integration tests for schema validation and migration adapters.
3. Notification delivery smoke tests for critical alert classes.

### Risks and Mitigation
1. Risk: silent notification misrouting.
- Mitigation: shadow delivery logs and canary alert tests.

### Exit Criteria
1. One owner screen and one backend schema for alert policy.
2. System tab has no editable alert policy controls.

### Estimated Effort
5 to 8 days.

---

## Phase 5: Legacy Component Decommission

### Objective
Remove stale, duplicated, and non-routed components to reduce maintenance risk and accidental regressions.

### Problems Addressed
1. Legacy components can be unintentionally edited or reconnected.
2. Dead paths increase cognitive load and codebase entropy.

### Frontend Implementation Steps
1. Verify route graph has no references to legacy components.
2. Remove or archive legacy components after parity checks.
3. Delete dead imports and obsolete comments.
4. Update docs to reflect current architecture only.

### Backend Implementation Steps
1. Remove endpoint variants serving only legacy UI.
2. Keep temporary compatibility shims if external dependencies still exist.

### Decommission Checklist
1. Route references = zero.
2. Dynamic import references = zero.
3. Test fixtures updated.
4. Storybook/mock artifacts updated if present.

### Testing
1. Build and type-check after removals.
2. Route smoke tests for Super Admin navigation.
3. Regression E2E on critical settings flows.

### Risks and Mitigation
1. Risk: hidden dynamic imports or stale tests fail late.
- Mitigation: static code search + CI route smoke test.

### Exit Criteria
1. Legacy duplicate components fully removed from active code path.
2. No functionality regressions in consolidated views.

### Estimated Effort
2 to 4 days.

---

## Phase 6: UX and Information Architecture Polish

### Objective
Improve discoverability and enterprise readability after technical consolidation is complete.

### Problems Addressed
1. Crowded navigation and weak domain boundaries.
2. Low operator confidence due to unclear setting impact and ownership.

### Frontend Implementation Steps
1. Reorganize navigation into macro domains:
- Security
- Platform
- Data Lifecycle
- Monitoring and Alerts
- Integrations
- Operations
2. Add settings search and quick-jump capability.
3. Add impact labels (Low/Medium/High risk) per section.
4. Add "last changed by/when" metadata blocks in critical settings sections.
5. Standardize section naming and copy tone.

### Backend Implementation Steps
1. Expose lightweight audit metadata endpoints for changedBy/changedAt.
2. Ensure audit events include section/domain identifiers.

### Deliverables
1. Updated navigation structure.
2. Search and metadata visibility.
3. Copy and nomenclature standards.

### Testing
1. Usability validation with representative admin tasks.
2. Accessibility checks for navigation and search.
3. Snapshot tests for new IA shell.

### Risks and Mitigation
1. Risk: users need reorientation after IA changes.
- Mitigation: release notes and in-app "what changed" hints.

### Exit Criteria
1. Navigation reduced to clear macro domains.
2. Users can quickly locate and understand setting impact.

### Estimated Effort
4 to 6 days.

---

## Phase 7: Hardening, Release, and Post-Release Monitoring

### Objective
Ship safely with robust quality gates and observe behavior in production.

### Problems Addressed
1. Consolidation regressions may appear under real usage.
2. Race/idempotency issues in policy updates under concurrent admin operations.

### Frontend Implementation Steps
1. Expand E2E coverage for canonical flows:
- Security updates.
- Data lifecycle policy updates.
- Alert policy updates.
2. Add visual regression coverage for loading, empty, error, and success states.
3. Verify optimistic/pessimistic update behavior by policy risk class.

### Backend Implementation Steps
1. Add integration tests for consolidated schemas and adapters.
2. Test idempotency and race conditions on policy update endpoints.
3. Add post-release dashboards:
- Save failures by domain.
- Validation failure frequency.
- Request latency and retry rate.

### Release Strategy
1. Feature flags by domain.
2. Staged rollout:
- Internal admins.
- Limited tenant cohort.
- Full rollout.
3. Rollback plan:
- Keep compatibility adapters and previous read model for one cycle.

### Testing
1. Full regression suite.
2. Pre-release UAT checklist.
3. Post-release canary verification.

### Risks and Mitigation
1. Risk: latent schema mismatch in edge tenants.
- Mitigation: canary + fast rollback + dual-read fallback.

### Exit Criteria
1. All quality gates passed.
2. Stable production metrics after rollout window.
3. Compatibility adapters retired on schedule.

### Estimated Effort
5 to 8 days.

---

## 4. Cross-Phase Dependency Matrix

1. Phase 0 must complete before domain consolidation phases (2, 3, 4).
2. Phase 2 should precede Phase 3 and Phase 4 if team capacity is constrained.
3. Phase 5 starts only after phases 2 to 4 parity checks pass.
4. Phase 6 should begin after core ownership consolidation is functionally stable.
5. Phase 7 runs continuously but final gate requires completion of phases 2 to 6.

## 5. Suggested Sprint Packaging

1. Sprint A:
- Phase 0 + Phase 1 closeout items.
2. Sprint B:
- Phase 2 (Security consolidation).
3. Sprint C:
- Phase 3 (Data lifecycle consolidation).
4. Sprint D:
- Phase 4 + Phase 5 (alerts consolidation + decommission).
5. Sprint E:
- Phase 6 + Phase 7 final hardening and release.

## 6. Global Acceptance Checklist

1. No setting key has more than one editable owner.
2. Domain ownership is visible in UI and enforced by backend mapping.
3. Operational tabs do not duplicate policy editing.
4. Legacy duplicate components removed from active routes.
5. Consolidated schemas have passing integration coverage.
6. E2E and visual-state tests pass for critical Super Admin workflows.
7. Production telemetry confirms stable save and load behavior.

## 7. Notes for Current Status

Based on your update that loading has been unified system-wide, treat Phase 1 and Phase 1.5 as validation/hardening closeout phases rather than full implementation phases. Prioritize remaining risk in this order:

1. Security consolidation.
2. Data lifecycle consolidation.
3. Alerts and notification consolidation.
4. Legacy decommission.
5. IA polish and release hardening.
