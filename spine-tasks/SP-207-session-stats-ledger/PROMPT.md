# Task: SP-207 — Session Stats + Role Cost Breakdown

**Created:** 2026-07-13
**Size:** M

## Review Level: 1

**Assessment:** Read-only operator stats over existing telemetry; extension command + aggregate helper; no routing changes.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 1 (privacy), Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#118
- Bucket: ops hygiene (v0.12.1 patch operator override)
- Closes: #118
- Release: v0.12.1
- Manifest: `spine-tasks/_authoring/release-v0.12.1/manifest.md`

## Mission

Closes #118 — Add a privacy-safe **session / window stats** surface (llm-use `stats` / `stats_snapshot` analog) so operators can eyeball dogfood before #95 exports and #110 training. Aggregate recent `RoutingTelemetry` via existing `store.listTelemetry` into: count, mean cost/latency, share of planning_delegate vs direct, local vs cloud when distinguishable, and a **role cost breakdown** (primary pin path / planning_delegate frontier sub-call / other). Optional “vs always-frontier” savings estimate when fleet prices exist — **fail closed** (omit estimate) if prices missing. Expose `/smart-router stats` (human text) and a small JSON snapshot helper for automation. **Do not** change routing, pins, gates, or defaults.

## Dependencies

- **None**

## Context to Read First

- GitHub #118 body (AC + non-goals)
- `.pi/extensions/smart-router/commands.ts` — command registration / `history` path uses `runtime.store.listTelemetry`
- `.pi/extensions/smart-router/command-formatters.ts` — `formatHistoryMessage`, `parseSmartRouterArgs`
- `.pi/extensions/smart-router/types.ts` — `SmartRouterCommand` union
- `src/domain/types/entities.ts` — `RoutingTelemetry` (planning_delegate_* , estimated_cost_usd)
- `docs/qa/shadow-dogfood-protocol.md` — add one pointer to stats before export
- Inspiration only: llm-use `print_stats` / `stats_snapshot` (do not store raw prompts)

## Environment

- **Workspace:** `.pi/extensions/smart-router/`, `src/cli/` or `src/domain/`/`src/infrastructure/telemetry/` (aggregate pure helper), `tests/`, `README.md`, `docs/qa/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/commands.ts`, `.pi/extensions/smart-router/command-formatters.ts`, `.pi/extensions/smart-router/types.ts`, `tests/unit/session-stats.test.ts`, `README.md`, `docs/qa/shadow-dogfood-protocol.md` |
| May change | `src/cli/smart-router-cli.ts`, new pure helper under `src/infrastructure/telemetry/` or `src/cli/` (e.g. `session-stats.ts`), `tests/unit/**`, `.pi/extensions/smart-router/**` (completion / usage strings only) |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/config/defaults.ts`, `config/release-gates.json`, `config/p-success-weights.json`, encoder/matcher paths |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/session-stats.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/commands.ts`, `README.md`, `docs/qa/shadow-dogfood-protocol.md`, `tests/unit/session-stats.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `src/config/defaults.ts`, `config/release-gates.json` |
| completionCriteria | `/smart-router stats` works from existing telemetry; role breakdown present; privacy-safe (no prompt text); optional frontier savings fails closed; README + protocol pointer; #118 closable. |

> **Note for worker:** Create `tests/unit/session-stats.test.ts` for the aggregate helper. Also run `vitest run tests/unit/smart-router-extension.test.ts` (or update it) if command parsing lives only in the extension tests — record extra paths in STATUS if needed.

## Steps

### Step 1: Aggregate helper + formatters

- [ ] Add pure `aggregateSessionStats(entries)` (or equivalent) over `RoutingTelemetry[]` → counts, sums/means for cost + latency, planning_delegate share, role cost buckets
- [ ] Optional frontier-savings helper: only when price inputs available; otherwise omit field
- [ ] `formatStatsMessage` for operator text; JSON snapshot type for automation
- [ ] Unit tests for empty store, mixed delegate/direct, privacy (assert no prompt keys)

**Plan-review checkpoint** — Confirm no writes to routing decision path.

### Step 2: Wire `/smart-router stats`

- [ ] Extend `SmartRouterCommand` + `parseSmartRouterArgs` + completion/usage strings
- [ ] Handler: `listTelemetry` with a safe default/max limit → format → reply
- [ ] Do not change routing middleware / pipeline / defaults

### Step 3: Docs + Testing & Verification

- [ ] README: document `/smart-router stats` under dogfood / operator commands
- [ ] `docs/qa/shadow-dogfood-protocol.md`: one-line “run stats before/during export window”
- [ ] Run Contract `testCommand` (or scoped vitest equivalent recorded in STATUS)
- [ ] Run `npm run verify:ci` if time allows; at minimum typecheck + unit tests above
- [ ] Coverage: `npm run coverage:check` if application code changed — ≥77% line coverage
- [ ] Comment on #118 and close when complete

## Documentation Requirements

**Must Update:**
- `README.md` — stats command
- `docs/qa/shadow-dogfood-protocol.md` — pointer for #95 operators

**Check If Affected:**
- `.pi/extensions/smart-router/` usage strings only

## Completion Criteria

- [ ] `/smart-router stats` returns privacy-safe aggregates from store telemetry
- [ ] Role cost breakdown present (primary / planning_delegate / other)
- [ ] Optional savings fails closed without prices
- [ ] No routing / default / gate changes
- [ ] #118 closable

## Git Commit Convention

- `feat(SP-207): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Store or print prompt/message/tool arg bodies
- Change `router-pipeline`, pins, frugality, absolute gates, encoder defaults
- Implement #115–#117 / #119–#120 in this task
- Close #95 (human QA)

## Amendments

- 2026-07-13 (worker): Contract `testCommand` updated to `npx vitest` (bare `vitest` → exit 127 in engine PATH; matches SP-198–SP-203 packets).
