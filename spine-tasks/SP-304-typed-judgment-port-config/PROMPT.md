# Task: SP-304 — TypedJudgmentPort + typed_judgment operator config

**Created:** 2026-10-24
**Size:** S

## Review Level: 2

**Assessment:** New domain port and operator config section for Jev-compatible typed judgments; config enforces fail-closed remote endpoints.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 2, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#184
- Epic: beettlle/pi-smart-router#183
- Release: v1.3.0
- Bucket: feature
- Partial: #184 (domain port + config; HTTP adapter in SP-305)

## Mission

The router has no way to ask a calibrated, schema-safe semantic question about a turn. `HttpFetchPort` in `src/domain/ports/local-runtime-port.ts` only supports GET-style pings. Add the domain side of #184:

- New `src/domain/ports/typed-judgment-port.ts` (domain types only, no fetch):
  - Question wire types for the three Jev answer kinds: `choice` (options list), `score` (anchored levels), `noul` (yes/no with true/false criteria). Each question has a stable `id`.
  - Answer types: `choice {choice, probabilities, confidence}`, `score {score, legend, probabilities, confidence}`, `noul {noul}` — keyed by question id in `TypedJudgmentAnswers`.
  - `TypedJudgmentPort.judge(state: string, questions, options: { signal: AbortSignal }) → Promise<TypedJudgmentAnswers>`. The port may reject; callers (SP-307) fail open.
  - A typed error shape (`TypedJudgmentError` with `kind: 'bad_request' | 'validation' | 'auth' | 'rate_limited' | 'overloaded' | 'timeout' | 'aborted' | 'invalid_response' | 'transport'`) so the adapter maps HTTP failures without leaking text.
- Operator config `typed_judgment` in `src/domain/types/schemas.ts` (zod, explicit defaults), added to `OperatorConfigSchema` as optional and to `DEFAULT_OPERATOR_CONFIG` in `src/config/defaults.ts`:
  - `enabled: false`
  - `endpoint: "http://127.0.0.1:8080/v1/systemone"`
  - `model: "openjev-latest"`
  - `timeout_ms` — default sized for user-prompt turns (1500); document why in a comment (local OpenJev ~385–990 ms per epic #183)
  - `samples: 1` (OpenJev extension; adapter omits it for hosted Jev)
  - `api_key_env: "TYPESAFE_API_KEY"`
  - `allow_remote: false`
  - `min_confidence` (0–1, default 0.6) — consumed by later trains (#188); define it now so the config shape is stable
- **Fail closed on remote:** `superRefine` rejects a non-loopback `endpoint` host (anything other than `127.0.0.1`, `::1`, `localhost`) unless `allow_remote: true`, with a clear message. The schema never holds a key value — only the env var name.
- Env overrides following the existing `resolve*ConfigFromEnv` pattern (e.g. `SMART_ROUTER_TYPED_JUDGMENT_ENABLED`, `SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT`, `SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS`); wire into `resolveOperatorConfigFromEnv`. An env endpoint override is re-validated by the same loopback rule; on failure fall back to the base config and keep `enabled: false`.

## Dependencies

- None

## Context to Read First

- Issue beettlle/pi-smart-router#184 and epic #183 (design, evidence)
- `src/domain/ports/local-runtime-port.ts` (port style, header comment conventions)
- `src/domain/types/schemas.ts` (`AdaptiveReasoningConfigSchema` + `resolveAdaptiveReasoningConfigFromEnv`, `OperatorConfigSchema`)
- `src/config/defaults.ts` (`resolveOperatorConfigFromEnv`, `DEFAULT_OPERATOR_CONFIG`)
- `tests/unit/operator-config.test.ts`, `tests/unit/defaults.test.ts`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/ports/typed-judgment-port.ts`, `src/domain/types/schemas.ts`, `src/config/defaults.ts`, `tests/unit/typed-judgment-config.test.ts` |
| May change | `src/domain/types/index.ts` (re-exports), `tests/unit/defaults.test.ts`, `tests/unit/operator-config.test.ts` |
| Must NOT change | `package.json`, `src/infrastructure/**`, `src/domain/pipeline/**`, `.pi/extensions/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/typed-judgment-config.test.ts tests/unit/defaults.test.ts tests/unit/operator-config.test.ts && bash scripts/spine-stet-contract-run.sh default SP-304` |
| fileScopeMustChange | `src/domain/ports/typed-judgment-port.ts`, `src/domain/types/schemas.ts`, `tests/unit/typed-judgment-config.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/infrastructure/`, `src/domain/pipeline/`, `.review/` |
| completionCriteria | Port + answer/error types exported; `typed_judgment` config with documented defaults (disabled); non-loopback endpoint rejected without `allow_remote`; env overrides re-validated; tests green |

## Steps

### Step 0: Preflight

- [ ] Read the config/env resolver pattern and confirm `OperatorConfigSchema` optional-section convention

### Step 1: Port and types

- [ ] Create `typed-judgment-port.ts` with question, answer, error and port types

### Step 2: Config

- [ ] `TypedJudgmentConfigSchema` with defaults + loopback `superRefine`; add to `OperatorConfigSchema` and `DEFAULT_OPERATOR_CONFIG`
- [ ] Env resolver wired into `resolveOperatorConfigFromEnv`

### Step 3: Testing & Verification

- [ ] Defaults parse; `enabled` is false
- [ ] `127.0.0.1`, `localhost`, `[::1]` endpoints accepted
- [ ] Remote endpoint rejected without `allow_remote`; accepted with it
- [ ] Invalid env endpoint override leaves the base config intact and disabled
- [ ] Run Contract `testCommand`

## Do NOT

- Add npm dependencies
- Read API key values in domain code or store them in config
- Wire the port into the pipeline (SP-307/SP-308)

## Completion Criteria

- [ ] #184 config + port acceptance items met
- [ ] Contract tests green
