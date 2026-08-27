# Task: SP-231 — Broaden Gemini replay repair for non-Google toolCalls

**Created:** 2026-08-27
**Size:** M

## Review Level: 1

**Assessment:** Extend existing repairGeminiReplayContext to inject sentinel on unsigned toolCalls from any prior provider when targeting Google; unit + extension tests.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#158
- Bucket: bug
- Partial: #158
- Release: v0.18.0
- Manifest: `spine-tasks/_authoring/release-v0.18.0/manifest.md`

## Mission

Partial #158 — When `isGoogleDelegationTarget`, inject `GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL` on **every** `toolCall` missing a signature (OpenAI/Anthropic/GLM/any prior provider), not only Google-origin turns. Preserve real signatures when present. Align identity as needed so pi-ai same-model replay works. Unit tests must cover non-Google-tagged tool history → Google target. Guard expansion and README ship in SP-232; failover safety net in SP-233.

## Dependencies

- None

## Context to Read First

- `src/domain/delegation/delegation-context.ts` — `repairGeminiReplayContext`
- `tests/unit/delegation-context.test.ts`
- `tests/unit/smart-router-extension.test.ts`
- GitHub #158 acceptance criteria (repair half)
- Parent split: none — phase 1 of #158 (SP-232 closes)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/delegation/delegation-context.ts`, `tests/unit/delegation-context.test.ts` |
| May change | `tests/unit/smart-router-extension.test.ts`, `.pi/extensions/smart-router/delegation-runtime.ts` |
| Must NOT change | `src/domain/routing/tool-history-guard.ts`, `README.md` (SP-232), failover path (SP-233) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/delegation-context.test.ts tests/unit/smart-router-extension.test.ts` |
| fileScopeMustChange | `src/domain/delegation/delegation-context.ts` |
| fileScopeMustNotChange | `src/domain/routing/tool-history-guard.ts` |
| completionCriteria | Non-Google unsigned toolCalls get sentinel when targeting Google; existing signatures preserved; prior Google-origin repair still works; tests green |

## Steps

### Step 1: Broaden repairGeminiReplayContext

- [ ] When targeting Google, inject sentinel on all unsigned toolCall blocks regardless of prior provider
- [ ] Preserve present signatures; keep Google-origin behavior intact
- [ ] Align identity/replay fields if required for pi-ai same-model replay

### Step 2: Unit and extension coverage

- [ ] Tests: OpenAI/Anthropic/GLM-tagged (non-Google) tool history → Google target gets sentinel on unsigned calls
- [ ] Tests: existing signatures preserved; Google-origin cases still pass
- [ ] Extension path: multi-turn non-Google tools then Gemini select → repaired context (no terminal thought_signature path for this case)

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Cross-provider unsigned toolCalls repaired for Google targets
- [ ] Unit/extension tests cover non-Google → Gemini repair
- [ ] Partial #158 phase 1 done; guard/README left to SP-232

## Do NOT

- Expand tool-history-guard or README (SP-232)
- Add protocol-affinity failover (SP-233)
- Classify thought_signature as infra / circuit-breaker
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

## Git Commit Convention

- `fix(SP-231): description`
