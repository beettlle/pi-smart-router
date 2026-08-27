# Task: SP-232 — Expand Gemini tool-history guard + README

**Created:** 2026-08-27
**Size:** M

## Review Level: 1

**Assessment:** Expand resolveEffectiveFleet / tool-history guard for unsigned cross-provider tool history; document silent repair/reroute in README. Closes #158 after SP-231.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#158
- Bucket: bug
- Closes: #158
- Release: v0.18.0
- Manifest: `spine-tasks/_authoring/release-v0.18.0/manifest.md`

## Mission

Closes #158 — After SP-231 repair, expand the tool-history guard so unsigned (or otherwise Google-unsafe) tool history excludes Gemini from `effectiveFleet` when needed and routes to a non-Google model with a clear reason_code. Google-only fleet → actionable empty-fleet error (reuse #38 fail-safe; not `selected_model_id: unknown`). README Gemini troubleshooting: primary path is silent repair/reroute; de-emphasize `/new` for the common cross-provider case. Residual failover remains SP-233.

## Dependencies

- **Task:** SP-231 (cross-provider repair must land first)

## Context to Read First

- `src/domain/routing/tool-history-guard.ts`
- `tests/unit/tool-history-guard.test.ts`
- `src/domain/delegation/delegation-context.ts` (SP-231 result)
- `README.md` — Gemini thought_signature section
- Parent split: SP-231 — repair half of #158

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/tool-history-guard.ts`, `tests/unit/tool-history-guard.test.ts`, `README.md` |
| May change | `.pi/extensions/smart-router/delegation-runtime.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | Protocol-affinity failover branch (SP-233); SQLite hot path (#142) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/tool-history-guard.test.ts tests/unit/delegation-context.test.ts tests/unit/smart-router-extension.test.ts` |
| fileScopeMustChange | `src/domain/routing/tool-history-guard.ts`, `README.md` |
| fileScopeMustNotChange | `src/infrastructure/persistence/sqlite-store.ts` |
| completionCriteria | Guard excludes Gemini / empty-fleet actionable when unsigned history unsafe; README primary path is repair/reroute; #158 closable |

## Steps

### Step 1: Expand tool-history guard

- [ ] Detect unsigned / Google-unsafe tool history before Google select
- [ ] Exclude Gemini from effectiveFleet; prefer non-Google with clear reason_code
- [ ] Google-only fleet → actionable empty-fleet error (#38 pattern)

### Step 2: README + tests

- [ ] README: silent repair/reroute primary; `/new` de-emphasized for cross-provider case
- [ ] Unit tests for guard cases in #158 AC
- [ ] Extension coverage where applicable

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Guard + README satisfy #158 AC
- [ ] #158 closable after integrate

## Do NOT

- Implement thought_signature failover (SP-233)
- Treat thought_signature as infra circuit-breaker
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

## Git Commit Convention

- `fix(SP-232): description`
