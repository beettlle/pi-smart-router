# Task: SP-305 — Jev-compatible HTTP adapter + fail-closed factory

**Created:** 2026-10-24
**Size:** M

## Review Level: 2

**Assessment:** Infrastructure adapter for `POST /v1/systemone` with zod response validation, bounded retries, abort/timeout, and redacted errors; factory fails closed for remote endpoints without a key.
**Score:** 5/8 — Blast radius: 1, Pattern novelty: 1, Security: 2, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#184
- Epic: beettlle/pi-smart-router#183
- Release: v1.3.0
- Bucket: feature
- Closes: #184 (with SP-304)

## Mission

Implement `TypedJudgmentPort` (SP-304) over global `fetch` (Node ≥ 22.19). **No new npm dependencies.**

- New `src/infrastructure/judgment/jev-typed-judgment-adapter.ts`:
  - `POST {endpoint}` with JSON body `{ model, state, questions, samples? }`. Send `samples` only for loopback endpoints (OpenJev extension); omit for hosted Jev.
  - Remote endpoints send `Authorization: Bearer <key>`; the key is read from `process.env[config.api_key_env]` at construction, never from config files, never logged.
  - Zod-validate responses: `choice {choice, probabilities, confidence}`, `score {score, legend, probabilities, confidence}`, `noul {noul}`. Reject a `choice` not in the question's options and any missing answer id → `invalid_response`.
  - Error mapping to SP-304 `TypedJudgmentError.kind`: `400` → `bad_request`, `422` → `validation`, `401`/`403` → `auth` (carry `detail.error_type` only), `429` → `rate_limited`, `529` → `overloaded`, network → `transport`.
  - Retry only `429`/`529`: max 2 retries, linear backoff, and only while time remains inside `timeout_ms`.
  - Combine the caller's `AbortSignal` with the timeout via `AbortSignal.any`; distinguish `timeout` from `aborted`.
  - Never include prompt or state text in thrown errors or logs; pass messages through `redactPromptFromError` (`src/domain/pipeline/stage-helpers.ts`).
- Factory `createTypedJudgmentPort(config, env = process.env)`: returns `{ port: TypedJudgmentPort } | { port: null, reason }`. Returns `null` with reason `typed_judgment_disabled` when disabled and `typed_judgment_remote_key_missing` when the endpoint is remote and the env key is empty (fail closed).
- Recorded OpenJev response fixtures under `tests/fixtures/typed-judgment/` (success for each answer type, 400, 422, 401). Fixtures may be hand-authored from the OpenJev README shapes; record provenance in each fixture with a `"_source"` field (e.g. `"openjev README shape"` or `"recorded openjev-0.1 2026-10-xx"`).

## Dependencies

- SP-304

## Context to Read First

- Issue beettlle/pi-smart-router#184
- `src/domain/ports/typed-judgment-port.ts` (from SP-304)
- `src/infrastructure/local/local-zero-tier.ts` (Node fetch binding style)
- `src/domain/pipeline/stage-helpers.ts` (`redactPromptFromError`)
- OpenJev README (error shapes, `samples` extension): https://github.com/razorback16/openjev

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None (tests stub `fetch`; no live judge in CI)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/judgment/jev-typed-judgment-adapter.ts`, `tests/unit/typed-judgment-adapter.test.ts`, `tests/fixtures/typed-judgment` |
| May change | `src/domain/ports/typed-judgment-port.ts` (type fixes only) |
| Must NOT change | `package.json`, `package-lock.json`, `src/domain/pipeline/**`, `src/domain/types/schemas.ts`, `.pi/extensions/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/typed-judgment-adapter.test.ts && bash scripts/spine-stet-contract-run.sh default SP-305` |
| fileScopeMustChange | `src/infrastructure/judgment/jev-typed-judgment-adapter.ts`, `tests/unit/typed-judgment-adapter.test.ts` |
| fileScopeMustNotChange | `package.json`, `package-lock.json`, `src/domain/pipeline/`, `.review/` |
| completionCriteria | Adapter implements the port over global fetch; response validation, error mapping, bounded retry, timeout/abort; factory fails closed for remote without key; no prompt text in errors; fixture tests green |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-304 types and config are on `main`; confirm `AbortSignal.any` is available on the Node floor in `package.json` `engines`

### Step 1: Adapter

- [ ] Request building (loopback vs remote body/headers), response zod validation, error mapping

### Step 2: Retry, timeout, abort, factory

- [ ] Bounded 429/529 retry inside `timeout_ms`; `AbortSignal.any`; `createTypedJudgmentPort` fail-closed reasons

### Step 3: Testing & Verification

- [ ] Fixtures: success per answer type; 400; 422; 401; 429 then success; 529 exhausted
- [ ] Timeout → `timeout`; caller abort → `aborted`; unknown choice → `invalid_response`
- [ ] Remote without key → factory `null` + reason; loopback omits Authorization and keeps `samples`
- [ ] Thrown error messages never contain the state string
- [ ] Run Contract `testCommand`

## Do NOT

- Add npm dependencies
- Use `think`, `steps`, `images`, `sequential` extensions
- Log request bodies or keys

## Completion Criteria

- [ ] #184 transport acceptance items met (with SP-304)
- [ ] Contract tests green
