# Task: SP-320 — Parse status-prefix provider errors; stop false 5xx-from-body

**Created:** 2026-11-19
**Size:** S

## Review Level: 1

**Assessment:** Fix `parseProviderError` so `"NNN: {json}"` extracts the real status and body digits never fake a 5xx.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#194
- Release: v1.5.0
- Bucket: bug
- Partial: #194 (parse only; recording/failover in SP-321/SP-322)

## Mission

`parseProviderError` only JSON-parses strings that start with `{`. pi-ai relays `"400: {json}"`, so status is lost and the fallback `/\\b(429|5\\d{2})\\b/` scans the whole body — a 4xx text containing `512` becomes `statusCode: 512` / infra.

1. Parse a leading `\\d{3}:` status prefix; when the remainder is JSON, use that object as today.
2. Restrict the 429/5xx fallback regex to a **leading** status token (not anywhere in the text).
3. Keep #37 carve-outs (Gemini `thought_signature` 400 must stay non-infra).

Do **not** change `recordDelegateOutcome` or failover here.

## Dependencies

(none)

## Context to Read First

- Issue beettlle/pi-smart-router#194 (Proposed fix items 1 + tests a/b)
- `src/infrastructure/delegation/provider-error.ts`
- Existing unit tests under `tests/unit/**` that cover provider-error / infra classification

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/delegation/provider-error.ts`, `tests/unit/provider-error.test.ts` |
| May change | `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `.pi/extensions/`, `src/domain/`, `src/infrastructure/gateway/`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/provider-error.test.ts && bash scripts/spine-stet-contract-run.sh lenient SP-320` |
| fileScopeMustChange | `src/infrastructure/delegation/provider-error.ts`, `tests/unit/provider-error.test.ts` |
| fileScopeMustNotChange | `.pi/extensions/`, `src/domain/`, `package.json`, `.review/` |
| completionCriteria | `"400: {json}"` → statusCode 400; 4xx body with 512/503 stays non-infra; thought_signature path unchanged; tests green |

## Steps

### Step 0: Preflight

- [ ] Read current `parseProviderError` branches and list existing tests
- [ ] Confirm #37 thought_signature expectations still documented in source/tests

### Step 1: Implement parse fixes

- [ ] Leading `NNN:` + JSON remainder path
- [ ] Leading-only 429/5xx fallback; no mid-body false positives

### Step 2: Testing & Verification

- [ ] Unit: `"400: {json}"` → `statusCode: 400`
- [ ] Unit: `"400: max_tokens must be <= 512"` stays non-infra
- [ ] Unit: thought_signature 400 still non-infra
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step when Review Level > 0

## Do NOT

- Edit `delegate-stream.ts` / `route-and-delegate.ts` (SP-321/SP-322)
- Classify all 400s as infra (#37)

## Completion Criteria

- [ ] #194 parse items (Proposed fix 1 + tests a/b) met
- [ ] Contract green

## Git Commit Convention

`fix(SP-320): parse status-prefix provider errors (#194)`
