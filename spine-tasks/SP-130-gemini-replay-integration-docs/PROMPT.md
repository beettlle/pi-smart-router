# Task: SP-130 — Gemini Replay Integration Tests and Operator Docs

**Created:** 2026-07-08
**Size:** S

## Review Level: 1

**Assessment:** v0.2.0 dogfood exit — end-to-end extension tests, README, provider error copy.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#85
- Release: v0.2.0
- Bucket: feature

## Mission

Ship operator-visible completion for v0.2.0 Gemini replay repair:

1. **Extension tests** — end-to-end multi-turn Gemini tool session succeeds (turn 1 tool call on `gemini-flash`, turn 2 continuation; no `thought_signature` 400 path).
2. **SP-084 regression** — Google-only fleet + Google tool history: update test expectations honestly (repair succeeds or actionable error remains).
3. **README** — § Gemini `thought_signature`: document replay repair as primary fix; SP-077 guard as narrowed fail-safe; de-emphasize "wait for pi#6342" as primary workaround.
4. **Provider error copy** — `src/infra/gemini-provider.ts` operator guidance mentions in-repo repair.

**v0.2.0 dogfood gate:** Operator can run `/model smart-router/auto` with Gemini economical models in fleet; typical Gemini-first tool loops no longer require `/new` or non-Google fallback.

## Dependencies

- **Task:** SP-128
- **Task:** SP-129

## Context to Read First

- `tests/unit/smart-router-extension.test.ts` — SP-077, SP-084, SP-128 tests
- `README.md` — Gemini thought_signature troubleshooting
- `src/infra/gemini-provider.ts` — `formatGeminiThoughtSignatureErrorMessage`
- `tests/unit/gemini-provider.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/smart-router-extension.test.ts`, `README.md`, `src/infra/gemini-provider.ts`, `tests/unit/gemini-provider.test.ts` |
| May change | `tests/unit/tool-history-guard.test.ts` (expectation updates only if SP-129 left gaps) |
| Must NOT change | `src/domain/delegation/delegation-context.ts` unless SP-127 amendment note required |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `README.md`, `src/infra/gemini-provider.ts` |
| fileScopeMustNotChange | `src/domain/delegation/delegation-context.ts` |
| completionCriteria | Multi-turn Gemini extension test passes; README repair-first; provider error copy updated; v0.2.0 dogfood gate documented. |

## Testing

- Extension: multi-turn Gemini tool session integration test
- Unit: gemini-provider formatted message tests
- Optional before v0.2.0 tag: `npm run verify:ci`
- Run `npm run typecheck && npm test`

## Steps

### Step 1: End-to-end extension test

- [ ] Multi-turn Gemini tool session (gemini-flash turn 1, continuation turn 2)
- [ ] Assert no thought_signature terminal error path
- [ ] Update SP-084 expectations if repair covers google-only fleet case

### Step 2: README and provider copy

- [ ] README: replay repair primary fix; narrowed guard fail-safe
- [ ] Update gemini-provider operator guidance and tests

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Note optional `npm run verify:ci` for v0.2.0 release tag

## Completion Criteria

- [ ] Multi-turn Gemini tool delegation passes extension tests
- [ ] README documents repair-first troubleshooting
- [ ] Provider error messages reference in-repo repair
- [ ] #85 acceptance criteria met
- [ ] Tests pass

## Git Commit Convention

- `docs(SP-130): description` or `test(SP-130): description` as appropriate

## Do NOT

- Reimplement repair logic (SP-127/128)
- Change guard semantics (SP-129)
- Bump npm version or push release tags (operator action at v0.2.0 ship)

---

## Amendments (Added During Execution)
