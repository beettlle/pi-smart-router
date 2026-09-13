# SP-294: cascade docs + eval report — Status

**Current Step:** Done
**Status:** 🟢 Complete
**Last Updated:** 2026-09-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Confirm SP-291–293 behaviors
  - SP-291: `EncoderCascadeConfigSchema` {enabled:false, long_context_encoder:'granite', token_threshold:512} + `selectEncoderForPrompt` pure gate (`src/domain/matching/encoder-gate.ts`), reason codes `cascade_disabled|under_threshold|over_threshold|granite_fallback`, turn-envelope estimator parity; 17 unit tests.
  - SP-292: `createCascadingTextEmbedder` (lazy per-encoder sessions, degrade-never-mix `granite_fallback` latch, dispose both) wired via `createOnnxEmbeddingProvider` when `encoder_cascade.enabled`; sidecar telemetry `encoder_selected`/`token_estimate`/`cascade_threshold`/`cascade_fallback_reason`; 18 tests.
  - SP-293: `bootstrap-routing-centroids --encoder granite` → namespaced `config/routing-centroids.granite.json` with `encoder` flavor stamp; verify rejects cross-encoder bundles + unknown flavors fail-closed; granite bundles require `hydra_projection.trained_sample_count=0` (honest-untrained); 19 tests.
- [x] Locate README/migration sections
  - README encoder table ~L976 (`| Encoder | Model | Context | Default |`) + config snippet + benchmark section; Granite #167 runbook already landed (SP-295).
  - `docs/migration-v1.md` — add v1.2.0 composition/config notes section (guide already carries v1.1.0 update precedent).

---

### Step 1: Docs + report
**Status:** ✅ Complete

- [x] Update README + migration-v1
  - README: additive cascade subsection after encoder table — config snippet, default-off/lazy-memory/degrade-never-mix/telemetry bullets, pointer to qa report. No default flips; Granite #167 runbook (SP-295) untouched.
  - `docs/migration-v1.md`: new "Long-context encoder cascade (v1.2.0, #173)" section (composition + config notes, additive key within SemVer promise); "What 1.0 does not change" encoder bullet extended to state cascade ships default-off through v1.2.0.
- [x] Write docs/qa cascade replay report
  - `docs/qa/encoder-cascade-replay-v1.2.0.md`: gate replay over 405 labeled dogfood rows (min 1274 / p50 1319 / p95 8856 / max 34902 est. tokens — 100% over 512 threshold on observed traffic), gate overhead p50 0.0004 ms, fresh `npm run benchmark:encoder` (Granite p50 18.46 / p95 22.34 ms PASS ≤120 ms), SP-291–293 test evidence table, #173 eval-table legs mapped incl. the still-open improvement leg (evidence only, no default flip).

---

### Step 2: Testing & Verification
**Status:** ✅ Complete

- [x] Run npm run typecheck
  - Clean (tsc --noEmit, exit 0) on 2026-09-13 lane run.
- [x] STATUS #173 AC checklist

## #173 acceptance criteria — evidence across SP-291–294

| #173 AC | Status | Evidence |
|---------|--------|----------|
| `EncoderCascadeConfig` schema added; default off; existing installs unaffected | ✅ SP-291 | `src/domain/types/schemas.ts` (`EncoderCascadeConfigSchema`, defaults enabled:false/threshold:512), `src/config/defaults.ts`; operator-config contract test green |
| `selectEncoderForPrompt` pure gate + tests (estimator shared with turn-envelope) | ✅ SP-291 | `src/domain/matching/encoder-gate.ts`; 17 tests in `tests/unit/encoder-gate.test.ts` (boundaries, disabled, estimator parity) |
| `createCascadingTextEmbedder` lazy per-encoder sessions + fallback reason code | ✅ SP-292 | `src/domain/matching/embedding-provider.ts`; 18 tests — lazy load, `granite_fallback` latch, dispose both, never-mix |
| Granite centroid artifact via `routing:bootstrap-centroids --encoder granite` | ✅ SP-293 | `scripts/bootstrap-routing-centroids.ts` → namespaced `config/routing-centroids.granite.json` with `encoder` flavor stamp; 6 tests |
| `verify-routing-calibration` rejects cross-encoder mixing | ✅ SP-293 | `assertEncoderFlavorConsistency*` (raw-JSON, fail-closed); granite honest-untrained gate; shipped bundle verify 20/20 PASS |
| Telemetry `encoder_selected`/`token_estimate`/fallback reason on sidecar | ✅ SP-292 | Optional sidecar fields (`cascade_threshold` too) via `MatchResult.cascade_telemetry` → `RouterPipeline.attachFeatures`; absent when disabled |
| Cascade replay report in `docs/qa/` (evidence, not default flip) | ✅ SP-294 | `docs/qa/encoder-cascade-replay-v1.2.0.md` — 405-row dogfood gate replay + fresh encoder benchmark; improvement leg explicitly left open |
| README encoder table + `docs/migration-v1.md` composition/config notes | ✅ SP-294 | README additive cascade subsection; migration-v1 "Long-context encoder cascade (v1.2.0, #173)" section |

**Defaults audit:** `src/config/defaults.ts` untouched (git diff confirms); `encoder: 'minilm'`, `encoder_cascade.enabled: false`, `hydra_heads: 'learned_projection'` unchanged. No #96/ModernBERT claims made.

---
