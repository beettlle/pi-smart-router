# SP-295: Granite opt-in dogfood runbook — Status

**Current Step:** Complete
**Status:** 🟢 Complete
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
**Status:** ✅ Complete

- [x] Run npm run typecheck — PASS (`tsc --noEmit`, clean)
- [x] STATUS Close vs Partial for #167 — **Partial.** Autonomous AC (operator runbook: fetch/switch/verify/measure/archive + post-switch follow-ups) fully landed in README + config comment + release note. Human dogfood AC remaining: operator config switch on a dogfood install, Granite ONNX first-run download (cache absent here — MiniLM only), benchmark archive from dogfood hardware, smoke check, evidence comment on #167, cross-link on #96. See `spine-tasks/_authoring/release-v1.2.0/granite-dogfood-runbook-note.md`.

---

## Issue disposition

**#167: Partial** — runbook complete; human dogfood remaining. Do **not** close #167 until operator evidence is posted.
**Defaults honesty:** `src/config/defaults.ts` untouched; `DEFAULT_ENCODER` stays `minilm`; `modernbert_k4` not enabled; `config/release-gates.json` untouched.

---
