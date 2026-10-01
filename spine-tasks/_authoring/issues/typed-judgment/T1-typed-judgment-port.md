## Summary

Add a domain port and an infrastructure HTTP adapter for Jev-compatible typed judgments (`POST /v1/systemone`). Local [OpenJev](https://github.com/razorback16/openjev) is the default endpoint; hosted TypeSafe Jev or Codiv are explicit opt-in. Epic: {{EPIC}}.

## Priority

P1

## Pipeline stages

None yet (transport only). Consumed by the `typed_judgment` stage (Sprint 2).

## Problem / motivation

The router has no way to ask a calibrated, schema-safe semantic question about a turn. The existing `HttpFetchPort` in `src/domain/ports/local-runtime-port.ts` only supports GET-style pings (`fetch(url, { signal })` → `{ ok, json() }`): no method, body, headers, or status code.

## Proposed solution

- [ ] `TypedJudgmentPort` under `src/domain/ports/`: `judge(state: string, questions, options, signal) → Promise<TypedJudgmentAnswers>`. Domain types only; no fetch in domain.
- [ ] Adapter under `src/infrastructure/` using global `fetch` (Node ≥ 22.19). **No new npm dependencies.**
- [ ] Operator config `typed_judgment` in `src/domain/types/schemas.ts` (zod, explicit defaults):
  - `enabled: false`
  - `endpoint: "http://127.0.0.1:8080/v1/systemone"`
  - `model: "openjev-latest"` (OpenJev also accepts `jev-latest`)
  - `timeout_ms` (default sized for user-prompt turns; documented)
  - `samples: 1` (OpenJev extension; disables automatic re-reads; omitted for hosted Jev)
  - `api_key_env: "TYPESAFE_API_KEY"`
  - `allow_remote: false`
- [ ] **Fail closed on remote:** a non-loopback endpoint without `allow_remote: true` is rejected at config load with a clear reason. Remote endpoints require a non-empty key from `api_key_env`; keys are never read from config files.
- [ ] Zod-validate responses: `choice {choice, probabilities, confidence}`, `score {score, legend, probabilities, confidence}`, `noul {noul}`. Reject unknown choices.
- [ ] Error mapping: `400` (unaskable question / unknown model), `422` (validation list), `401`/`403` (`detail.error_type`), `429`, `529`. Retry only `429`/`529`, bounded (max 2 retries, linear backoff), and only within `timeout_ms`.
- [ ] Honor the caller's `AbortSignal` (`AbortSignal.any` with the timeout).
- [ ] Never log prompt or state text; errors go through `redactPromptFromError` (`src/domain/pipeline/stage-helpers.ts`).
- [ ] README: privacy note — with a hosted endpoint, turn text leaves the machine (to TypeSafe or Codiv). Local OpenJev keeps it local.

## Evidence

- Local OpenJev at `127.0.0.1:8080` serves `openjev-latest` / `openjev-0.1` (`GET /v1/models`), returns `server-timing` and `x-request-id` headers.
- OpenJev README documents the error shapes above and the `samples`, `steps`, `think`, `sequential`, `images` extensions.

## Dependencies

| Issue | Role |
|-------|------|
| {{EPIC}} | Parent epic |

## Out of scope

- Question set and state builder (separate Sprint 1 issue).
- Pipeline wiring.
- `think`, `steps`, `images`, `sequential` extensions.

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/typed-judgment-adapter.test.ts
```

- Unit tests with recorded OpenJev response fixtures (success for each answer type, 400, 422, 401, 429 then success, 529 exhausted, timeout, abort, unknown choice).
- Config tests: loopback accepted; remote rejected without `allow_remote`; remote rejected without key.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Port, adapter, config, tests | Autonomous |
| Record fixtures against local OpenJev | Operator (or autonomous with local server) |
