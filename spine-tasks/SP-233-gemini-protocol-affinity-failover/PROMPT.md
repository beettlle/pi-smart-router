# Task: SP-233 — One-shot non-Google failover on Gemini thought_signature 400

**Created:** 2026-08-27
**Size:** M

## Review Level: 1

**Assessment:** Residual safety net after #158 — one protocol-affinity failover to a non-Google fleet member; distinct reason_code; amend #37 terminal UX without infra classification.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#159
- Bucket: enhancement
- Closes: #159
- Depends on: #158 (SP-231, SP-232)
- Release: v0.18.0
- Manifest: `spine-tasks/_authoring/release-v0.18.0/manifest.md`

## Mission

Closes #159 — If Gemini still returns 400 missing `thought_signature` after #158 repair/guard, treat as model incompatible with this session’s replay state (not infrastructure) and fail over **once** to a non-Google fleet member so the agent loop continues. Keep: no infra/circuit-breaker classification; no Gemini↔Gemini retry solely for this error. Telemetry reason_code e.g. `gemini_replay_incompatible` (distinct from infra failover). No non-Google candidate → actionable empty-fleet / terminal guidance (no silent loop). README: residual path is automatic failover; `/new` last resort. Update tests that assert “no selectFailover on thought_signature” (#37).

## Dependencies

- **Task:** SP-232 (#158 closed — repair + guard before residual failover)

## Context to Read First

- `.pi/extensions/smart-router/route-and-delegate.ts`
- `.pi/extensions/smart-router/delegation-runtime.ts`
- `src/infra/gemini-provider.ts` — `shouldFailoverOnGeminiError` / classifiers
- `src/infrastructure/delegation/provider-error.ts`
- `tests/unit/smart-router-extension.test.ts`, `tests/unit/gemini-provider.test.ts`, `tests/unit/provider-error.test.ts`
- `README.md` — Gemini thought_signature section (SP-232)
- Parent split: none — depends on #158 packets SP-231/SP-232

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/route-and-delegate.ts`, `src/infra/gemini-provider.ts`, `tests/unit/smart-router-extension.test.ts` |
| May change | `.pi/extensions/smart-router/delegation-runtime.ts`, `src/infrastructure/delegation/provider-error.ts`, `tests/unit/gemini-provider.test.ts`, `tests/unit/provider-error.test.ts`, `README.md` |
| Must NOT change | Reclassify thought_signature as infra; SQLite hot path (#142) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/unit/gemini-provider.test.ts tests/unit/provider-error.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| fileScopeMustNotChange | `src/infrastructure/persistence/sqlite-store.ts` |
| completionCriteria | At most one non-Google failover on thought_signature 400; distinct reason_code; no infinite loop; README residual path; #159 closable |

## Steps

### Step 1: Protocol-affinity failover path

- [ ] On thought_signature assistant error during stream: select at most one non-Google candidate (`!isGoogleGeminiProfile`)
- [ ] Continue stream with that model; do not count as provider infra failure
- [ ] No candidate → actionable empty-fleet / terminal guidance

### Step 2: Telemetry, tests, README

- [ ] reason_code e.g. `gemini_replay_incompatible` (not infra failover)
- [ ] Update #37 tests that forbade selectFailover on thought_signature
- [ ] README: automatic non-Google failover as residual safety net; `/new` last resort

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] One-shot non-Google failover works; no infinite loop
- [ ] Distinct telemetry; README updated
- [ ] #159 closable

## Do NOT

- Gemini↔Gemini retry solely for thought_signature
- Circuit-breaker / infra classification for this error
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

## Git Commit Convention

- `feat(SP-233): description`
