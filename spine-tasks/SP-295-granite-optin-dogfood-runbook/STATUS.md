# SP-295: Granite opt-in dogfood runbook — Status

**Current Step:** Step 2: Testing & Verification
**Status:** 🟡 In Progress
**Last Updated:** 2026-09-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Confirm #80 code path shipped — `GRANITE_ONNX_MODEL` + `createGraniteOnnxTextEmbedder` + `case 'granite'` in `src/domain/matching/embedding-provider.ts`; `EncoderSchema`/`DEFAULT_ENCODER = 'minilm'` in `src/domain/types/schemas.ts`; `npm run benchmark:encoder` → `scripts/benchmark-encoder-latency.ts`
- [x] Note Granite cache may be absent — confirmed: `.pi-smart-router/models/` contains only `Xenova/` (MiniLM); Granite ONNX downloads on first use

---

### Step 1: Runbook
**Status:** ✅ Complete

- [x] Document fetch/switch/measure — README `HyDRA model cache → Granite opt-in dogfood runbook (#167)`: fetch (GRANITE_ONNX_MODEL, on-demand download, cache layout), switch (`hydra.encoder: granite`, keep `learned_projection`), verify resident (`/smart-router plan`/`doctor`, no silent MiniLM fallback), measure+archive (`npm run benchmark:encoder` → `.pi-smart-router/measurements/`, ≤120 ms budget). Plus `_encoder_documentation` comment key in `config/operator-config.json.example` (comment-only; value stays `minilm`)
- [x] Post-switch follow-ups + #96 cross-link — latency watch, centroid/cluster refresh, projection/calibration ECE, truncation signal, fail-open path, feed #96 (evidence only, no default flip), ModernBERT K=4 out of scope. Release note: `spine-tasks/_authoring/release-v1.2.0/granite-dogfood-runbook-note.md`

---

### Step 2: Testing & Verification
**Status:** ⬜ Not Started

- [ ] Run npm run typecheck
- [ ] STATUS Close vs Partial for #167

---
