# Task: SP-209 — Honor force_model_id / Prefer (No Silent Remap)

**Created:** 2026-07-19
**Size:** M

## Review Level: 1

**Assessment:** Fail-closed force/prefer for in-fleet Copilot/Gemini ids; stop silent Anthropic remaps observed in multi-fleet dogfood.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#121
- Bucket: bug
- Closes: #121
- Release: v0.13.0
- Manifest: `spine-tasks/_authoring/release-v0.13.0/manifest.md`

## Mission

Closes #121 — When `force_model_id` targets a healthy in-fleet `github-copilot/*` or Gemini id — or when an operator preference asks for Copilot — select that id, **or** fail closed with an explicit reason. Never silently remap to a different provider family. Explain / `SMART_ROUTER_LOG_ROUTING=1` must surface remap/reject reason. Add fixtures for Gemini-preview-style force, gpt-codex-style force, and NL prefer-Copilot where supported.

## Dependencies

- **Task:** SP-208 (multi-fleet aliases/coverage land first so force resolution uses grounded ids)

## Context to Read First

- GitHub #121 body (AC)
- `src/domain/pipeline/router-pipeline.ts` — force_model_id short-circuits
- `src/domain/pinning/session-pinner.ts` — force honor paths (~710, ~825)
- `src/api/middleware/pi-router-middleware.ts` — forceModelId one-shot
- `src/config/pi-model-mapper.ts` — only if resolve/alias still wrong after SP-208
- `src/api/explain/router-explain.ts`
- Related closed work: tool-history-guard / context-fit force honors

## Environment

- **Workspace:** `src/domain/pipeline/`, `src/api/`, `tests/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts`, `tests/unit/force-model-id-remap.test.ts` (create) |
| May change | `src/api/middleware/pi-router-middleware.ts`, `src/api/explain/router-explain.ts`, `src/domain/pinning/session-pinner.ts`, `src/config/pi-model-mapper.ts`, `tests/unit/**`, `tests/integration/**`, `.pi/extensions/smart-router/**` (prefer/NL wiring only) |
| Must NOT change | `config/release-gates.json`, `config/p-success-weights.json`, encoder/matcher defaults, `docs/capability-profile-coverage.md` (SP-208 owns) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/force-model-id-remap.test.ts` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts`, `tests/unit/force-model-id-remap.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `docs/capability-profile-coverage.md` |
| completionCriteria | Healthy in-fleet force selects that id or fails closed with reason; no silent cross-provider remap; explain/log surfaces reason; Gemini + codex-style fixtures pass; #121 closable. |

## Steps

### Step 1: Diagnose + fix force/prefer path

- [ ] Reproduce silent remap for Copilot/Gemini-style force vs Anthropic economical/frontier
- [ ] Fix selection/resolve so force/prefer never remaps across provider families without explicit reject
- [ ] Ensure explain / routing log records reject/remap reason
- [ ] Unit fixtures: force Gemini-preview-style; force gpt-codex-style; prefer Copilot where supported

**Plan-review checkpoint** — Confirm fail-closed (never silent wrong-family select).

### Step 2: Non-regression

- [ ] Healthy Anthropic-only fleets still force correctly
- [ ] Unhealthy / missing force id fails closed with reason (no crash)
- [ ] Do not weaken pin-break rules owned by SP-210

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related pipeline/pinning unit tests if force path shared
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #121 and close when complete

## Documentation Requirements

**Must Update:**
- None required beyond code comments / explain strings if operator-visible

**Check If Affected:**
- `README.md` — force/prefer behavior note if documented today
- `docs/qa/shadow-dogfood-protocol.md` — optional dogfood tip

## Completion Criteria

- [ ] Force healthy in-fleet id → that id selected
- [ ] Impossible force → explicit fail/reject reason (no silent remap)
- [ ] Explain / routing log surfaces reason
- [ ] Fixtures green for Gemini + codex-style + prefer Copilot
- [ ] #121 closable

## Git Commit Convention

- `fix(SP-209): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip encoder defaults or absolute release gates
- Rewrite coverage docs owned by SP-208
- Implement pin-break agentic upgrade (SP-210) or local_zero preference (SP-211)
- Close #95 / #110

## Amendments

None.
