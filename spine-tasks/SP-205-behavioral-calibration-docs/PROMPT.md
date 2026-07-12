# Task: SP-205 — Behavioral Calibration Docs (Zero-Manual-Label Bootstrap)

**Created:** 2026-07-12
**Size:** S

## Review Level: 0

**Assessment:** Docs-only — document passive dogfood signals → aggregate/train path for #110.
**Score:** 0/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#110
- Bucket: documentation
- Partial: #110 (docs / zero-manual-label bootstrap AC)
- Release: v0.12.0
- Manifest: `spine-tasks/_authoring/release-v0.12.0/manifest.md`

## Mission

Partial #110 — Document the **behavioral-first** (zero-manual-label) bootstrap path: which passive outcome fields from `SMART_ROUTER_DATASET=1` / telemetry-contrib (model override, compaction pin break, loop-escalation proxies, stop_reason) are sufficient to train without `/smart-router feedback`. Link `docs/qa/shadow-dogfood-protocol.md` → aggregate → `routing:train-p-success` / `routing:train-calibration` → verify. Update README calibration section so operators know synthetic fixture weights are interim until real floors are met (SP-206).

## Dependencies

- **None**

## Context to Read First

- `docs/qa/shadow-dogfood-protocol.md`
- README calibration / dogfood sections (search `routing:train-p-success`, isotonic gap)
- GitHub #110 body (Human vs autonomous table)
- `config/routing-calibration.json.example` — `minimum_training_samples`

## Environment

- **Workspace:** `README.md`, `docs/qa/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md`, `docs/qa/shadow-dogfood-protocol.md` |
| May change | `docs/qa/**` (optional short bootstrap note only if README would bloat) |
| Must NOT change | `src/**`, `config/p-success-weights.json`, `config/release-gates.json`, `src/config/defaults.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `README.md`, `docs/qa/shadow-dogfood-protocol.md` |
| fileScopeMustNotChange | `src/**`, `config/p-success-weights.json`, `config/release-gates.json` |
| completionCriteria | README + shadow protocol document zero-manual-label bootstrap and point to train/verify commands; Partial #110 docs AC met. |

## Steps

### Step 1: Document behavioral-first bootstrap

- [ ] In README calibration section: list passive outcome fields sufficient without `/feedback`; note ≥30 economical-tier sample floor; contrast current synthetic `config/p-success-weights.json` provenance vs behavioral adoption (SP-206)
- [ ] In `docs/qa/shadow-dogfood-protocol.md`: add Related / next-step pointer to #110 aggregate → train → verify commands; reinforce no invented labels
- [ ] Do not ship new calibration JSON in this task

### Step 2: Testing & Verification

- [ ] Confirm Contract paths changed (README + protocol)
- [ ] Run `npm run typecheck && npm test` (docs-only; suite must still pass)
- [ ] Comment on #110 that docs Partial landed; train/ship remains SP-206

## Documentation Requirements

**Must Update:**
- `README.md` — calibration / behavioral-first path
- `docs/qa/shadow-dogfood-protocol.md` — #110 next-step link

**Check If Affected:**
- `config/routing-calibration.json.example` (read-only unless a one-line comment is required)

## Completion Criteria

- [ ] Zero-manual-label bootstrap documented
- [ ] Protocol + README link to aggregate/train/verify
- [ ] No config artifact ships; no invented labels
- [ ] Partial #110 docs AC closable for this slice

## Git Commit Convention

- `docs(SP-205): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Train or overwrite `config/p-success-weights.json` / `config/routing-calibration.json`
- Change absolute release-gate thresholds or encoder defaults
- Close #110 fully (SP-206 owns train/ship) or #95 (human QA)
- Invent synthetic “behavioral” provenance

## Amendments

None.
