# SP-291: encoder cascade config + gate — Status

**Current Step:** 3
**Status:** ✅ Complete
**Last Updated:** 2026-09-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Read #173 + turn-envelope estimator
  - Gate reason codes per #173: `under_threshold` | `over_threshold` | `cascade_disabled` | `granite_fallback`
  - Turn-envelope estimator: `request.estimated_input_tokens ?? request.prompt_text.length` (turn-envelope-stage.ts:240); gate reuses same formula via optional `estimatedTokens` param
  - Long prompts = `token_estimate >= token_threshold` (per #173 eval table)
- [x] Confirm cascade fields absent
  - No `encoder_cascade` anywhere in hydra config/schemas; grep for cascade hits only unrelated infra/routing files

---

### Step 1: Schema + defaults
**Status:** ✅ Complete

- [x] Add EncoderCascadeConfig default off
  - Plan: `EncoderCascadeConfigSchema` {enabled: z.boolean().default(false), long_context_encoder: EncoderSchema.default('granite'), token_threshold: z.number().int().min(1).default(512)} + `DEFAULT_ENCODER_CASCADE_CONFIG`; add `encoder_cascade` (defaulted) to `HydraConfigSchema`; mirror in `DEFAULT_OPERATOR_CONFIG.hydra`
- [x] Document in operator-config example
  - Plan: add `encoder_cascade` block (enabled:false) + `_encoder_cascade_documentation`; defaults unchanged (operator-config.test.ts contract stays green)

---

### Step 2: Gate + tests
**Status:** ✅ Complete

- [x] Implement selectEncoderForPrompt
  - `src/domain/matching/encoder-gate.ts`: pure gate, reason codes `cascade_disabled | under_threshold | over_threshold | granite_fallback`; `estimatePromptTokens` = `estimatedTokens ?? prompt.length` (turn-envelope parity); boundary `>=` threshold
- [x] Unit tests for boundaries/disabled/parity
  - 17 tests in tests/unit/encoder-gate.test.ts — all green (incl. operator-config example contract test still passing)

---

### Step 3: Testing & Verification
**Status:** ✅ Complete

- [x] Run npm run verify:ci
  - First run failed typecheck: exactOptionalPropertyTypes rejected explicit `undefined` for optional `estimatedTokens` in parity test — fixed by typing options as `Encoder | undefined` / `number | undefined` in encoder-gate.ts
  - Rerun: EXIT=0 — build ✓ typecheck ✓ lint ✓ coverage:check ✓ (143 files, 2299 tests passed; encoder-gate.ts 100% lines/branches/functions)

---
