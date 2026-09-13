# SP-292: cascading embedder + telemetry — Status

**Current Step:** Done
**Status:** 🟢 Complete
**Last Updated:** 2026-09-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Confirm SP-291 gate API
- [x] Map createTextEmbedder dispose patterns

**Notes:** Gate API = `selectEncoderForPrompt(prompt, EncoderCascadeConfig, {primaryEncoder?, longContextAvailable?, estimatedTokens?})` → `{encoder, reason_code, token_estimate}`; reason codes include `granite_fallback`. Dispose pattern (SP-260): idempotent, fail-closed embed() after dispose, pipeline.dispose() → model.dispose() fallback. Issue #173 telemetry fields: `encoder_selected`, `token_estimate`, `cascade_threshold`, `cascade_fallback_reason`.

---

### Step 1: Cascading embedder
**Status:** ✅ Complete

- [x] Implement createCascadingTextEmbedder
- [x] Fallback reason code; dispose both

**Notes:** `createCascadingTextEmbedder(config, artifactCachePath, options?)` in embedding-provider.ts — lazy per-encoder sessions (primary on first embed, Granite only on first over-threshold prompt), SP-291 gate selection, degrade-never-mix fallback (`granite_fallback` + `longContextAvailable=false` latch), idempotent fail-loud dispose, fail-closed embed after dispose (SP-260 precedent). `sessionFactory` option enables unit tests without ONNX.

---

### Step 2: Wiring + telemetry
**Status:** ✅ Complete

- [x] Wire when cascade enabled
- [x] Emit telemetry fields

**Notes:** `createOnnxEmbeddingProvider` uses the cascade path only when `encoder_cascade.enabled`; `createHydraMatcherFromHydraConfig` passes `hydra.encoder_cascade` through. `EmbeddingProvider.cascadeTelemetry?()` surfaces `CascadeEmbedderTelemetry`; `MatchResult.cascade_telemetry` carries it; `RouterPipeline.attachFeatures` copies `encoder_selected`/`token_estimate`/`cascade_threshold`/`cascade_fallback_reason` onto the feature sidecar (absent when cascade disabled — wire decision byte-identical). Sidecar zod schema + entity extended (optional fields); `EncoderSchema` hoisted above `RoutingFeatureSidecarSchema` (TDZ).

---

### Step 3: Testing & Verification
**Status:** ✅ Complete

- [x] Tests for selection/lazy/fallback/dispose
- [x] Run npm run verify:ci

**Notes:** 18 new tests in tests/unit/embedding-provider.test.ts: selection (under/over threshold, disabled, never-mix identity), lazy load (no session until first embed, Granite only on over-threshold, one session per encoder), fallback (Granite load failure + embed failure → MiniLM + `granite_fallback` latch, primary failure propagates fail-loud), dispose (closes both, idempotent, fail-closed embed after dispose, fail-loud on session dispose error), telemetry wiring (provider.cascadeTelemetry, MatchResult.cascade_telemetry, sidecar schema fields, createHydraMatcherFromHydraConfig integration: disabled path stays MiniLM-only, enabled path lazy-loads Granite + emits telemetry). Gate estimates tokens over the metadata-prefixed HyDRA input — the exact text the encoder embeds/truncates.

**Verification:** build ✓, typecheck ✓, lint ✓, coverage:check ✓ (143 files / 2321 tests passed; embedding-provider.ts 96.42% lines, hydra-matcher.ts 96.56%, encoder-gate.ts 100%). GitNexus detect_changes unavailable in lane worktree (MCP process exited).

---

## Discoveries

- **Scope note:** emitting the telemetry fields on the live decision sidecar requires a 1-spot spread in `RouterPipeline.attachFeatures` (`src/domain/pipeline/router-pipeline.ts`). Treated as "telemetry/sidecar types/wiring under src/domain/**" per May-change scope; flagged here for reviewer visibility.
- `specs/001-build-smart-router/contracts/routing-decision.schema.json` (featureSidecar, additionalProperties:false) was NOT updated — outside File Scope and validated only against static fixtures in tests. Follow-up: add the four optional cascade fields to the JSON contract.
- Dataset recorder (`src/infrastructure/telemetry/dataset-recorder.ts`) not extended; sidecar-only telemetry per PROMPT.

---
