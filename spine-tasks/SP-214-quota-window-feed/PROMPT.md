# Task: SP-214 — Quota Window Feed for Virtual Cost v2

**Created:** 2026-08-02
**Size:** M

## Review Level: 1

**Assessment:** Produce optional `QuotaWindowPosition` via adapter → telemetry estimate → omit so virtual cost v2 can soft-bias late-window subscription spend (SP-173 wiring gap).
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#125
- Bucket: feature
- Closes: #125
- Release: v0.14.0
- Manifest: `spine-tasks/_authoring/release-v0.14.0/manifest.md`

## Mission

Closes #125 — Ship the missing **producer** of `QuotaWindowPosition` for virtual cost v2. There is no universal remaining-quota API; design must be adapter + degrade: (1) provider adapter when trustworthy, (2) telemetry-derived pool-level burn estimate (Cursor-style subscription pool first), (3) omit → flat virtual cost + SP-097 exhaustion failover. Wire available window position through extension → `createDispatchOptions` / pipeline. Soft bias only via existing virtual cost v2; no hard ban until remaining is very low (documented threshold). Do not invent per-model fractions for shared pools; do not re-implement virtual cost math (#78).

## Dependencies

- **None**

## Context to Read First

- GitHub #125 body (AC)
- `spine-tasks/_authoring/issues/issue-NEW-quota-window-feed.md`
- `src/domain/types/entities.ts` — `QuotaWindowPosition`
- `src/domain/pricing/virtual-cost-v2.ts` — consumer only
- `.pi/extensions/smart-router/fleet-bootstrap.ts` — `createDispatchOptions` / `quotaWindowPosition` extras
- SP-173 STATUS — extension operator wiring already accepts the field when supplied
- SP-097 Cursor quota exhaustion failover (safety net)
- Manifest: `spine-tasks/_authoring/release-v0.14.0/manifest.md`

## Environment

- **Workspace:** `src/domain/pricing/` or `src/infrastructure/`, `.pi/extensions/smart-router/`, `tests/`, `docs/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pricing/quota-window-feed.ts` (create), `.pi/extensions/smart-router/fleet-bootstrap.ts`, `tests/unit/quota-window-feed.test.ts` (create), `docs/routing-roadmap.md` |
| May change | `src/domain/types/**`, `src/config/defaults.ts`, `src/infrastructure/telemetry/**`, `.pi/extensions/smart-router/**` (dispatch wiring only), `README.md`, `tests/unit/**`, `tests/integration/**` |
| Must NOT change | `config/release-gates.json`, encoder defaults, virtual cost λ/exhaustion math in `virtual-cost-v2.ts` (consume only), `.pi/extensions/smart-router/planning-delegate.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/quota-window-feed.test.ts` |
| fileScopeMustChange | `src/domain/pricing/quota-window-feed.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts`, `tests/unit/quota-window-feed.test.ts`, `docs/routing-roadmap.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `.pi/extensions/smart-router/planning-delegate.ts` |
| completionCriteria | Adapter→estimate→omit documented; pool-level `QuotaWindowPosition` or omit wired into createDispatchOptions; soft bias only; unit tests; #125 closable. |

## Steps

### Step 1: Feed module + degrade chain

- [ ] Document non-universal remaining-quota; adapter interface + degrade rules (adapter → telemetry estimate → omit)
- [ ] Produce pool-level `QuotaWindowPosition` or omit (no invented per-model bars for shared pools)
- [ ] Soft bias via existing virtual cost v2 only; document hard-ban threshold if any (default: none / very low only)

**Plan-review checkpoint** — Confirm SP-097 remains safety net when feed missing/stale; no universal-provider claims.

### Step 2: Extension wiring + tests

- [ ] Wire feed into extension → `createDispatchOptions` / pipeline (`quotaWindowPosition`)
- [ ] Unit tests for estimate/adapter mapping
- [ ] Roadmap/README note: consumer landed (#78); this issue is the feed

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related virtual-cost / extension unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #125 and close when complete

## Documentation Requirements

**Must Update:**
- `docs/routing-roadmap.md` — note feed producer for P2 virtual cost v2 (also in File Scope May change)

**Check If Affected:**
- `README.md`

## Completion Criteria

- [ ] Degrade chain documented and implemented
- [ ] `QuotaWindowPosition` (or omit) wired through dispatch options
- [ ] Soft bias only; SP-097 safety net preserved
- [ ] #125 closable

## Git Commit Convention

- `feat(SP-214): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Re-implement virtual cost math (#78)
- Claim universal remaining-quota coverage for arbitrary fleets
- Hard-block models on stale signals without a documented very-low threshold
- Flip encoder defaults or absolute release gates
- Close #95 / #110 / #70 / #78

## Amendments

None.
