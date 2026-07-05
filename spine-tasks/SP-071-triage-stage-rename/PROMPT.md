# Task: SP-071 — Triage Stage Rename

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Rename duplicate `triage` pipeline stage for correct failedStage telemetry.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#31
- Bucket: bug

## Mission

`RouterPipeline` registers two stages named `'triage'` (frontier triage and cloud fallback). When `triageCloudFallback` fails, `resolveFailedStage()` reports `triage`, corrupting pipeline-error telemetry (SP-053).

Rename the second stage to a unique name (e.g. `triage_cloud_fallback`). Update schema/validation if stage names are persisted. Add regression test asserting correct `failedStage` in pipeline-error telemetry.

## Dependencies

- SP-070

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — stage registration ~lines 73–76
- `src/domain/schemas/` — `RoutingStageSchema` if stage names validated
- `tests/unit/router-pipeline.test.ts`
- SP-053 pipeline-error telemetry tests

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/domain/schemas/**`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts`, `src/api/middleware/pi-router-middleware.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Second triage stage has unique name; failedStage telemetry reports correct stage on cloud fallback failure; regression test added. |

## Steps

### Step 1: Rename duplicate stage

- [ ] Rename second `'triage'` stage to `triage_cloud_fallback` (or equivalent unique name)
- [ ] Update `RoutingStageSchema` or related validators if stage names are enumerated

### Step 2: Add regression test

- [ ] Test that cloud fallback failure reports `triage_cloud_fallback` (not generic `triage`) in pipeline-error telemetry

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] No duplicate stage names in RouterPipeline
- [ ] failedStage telemetry correct for cloud fallback path
- [ ] Regression test passes
- [ ] Zero-crash fallback behavior preserved

## Git Commit Convention

- `fix(SP-071): description`

## Do NOT

- Change routing logic beyond stage naming
- Modify extension or middleware in this task

---

## Amendments (Added During Execution)
