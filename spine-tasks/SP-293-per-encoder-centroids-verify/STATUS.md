# SP-293: per-encoder centroids + cal verify — Status

**Current Step:** 1
**Status:** 🟡 In Progress
**Last Updated:** 2026-09-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Inspect centroid/verify schema for encoder metadata

**Findings:**
- No `encoder` metadata exists in `RoutingCentroidsArtifact` or the calibration bundle; zod bundle schema strips unknown keys → verify must read raw bundle JSON to check encoder flavor (fail-closed per SP-252).
- `Encoder` type (`'minilm' | 'granite'`), `DEFAULT_ENCODER`, and `createTextEmbedder(encoder, cachePath)` factory already exist (SP-291/292, `src/domain/matching/embedding-provider.ts`) — bootstrap can select embedder without new src changes.
- `parseRoutingCentroidsArtifact` ignores unknown JSON fields → writer-side `encoder` field is backward compatible; shipped MiniLM defaults untouched.
- GitNexus MCP unavailable in lane; grep blast radius: only unit tests + npm script wrappers consume the two scripts (LOW risk).

**Plan:**
- Step 1: `--encoder minilm|granite` flag on bootstrap (default minilm); namespaced default output `config/routing-centroids.granite.json` for granite; artifact JSON gains `encoder` field; guard `main()` for testability.
- Step 2: `assertEncoderFlavorConsistency(rawBundle)` in verify — implicit minilm when field absent, reject mixed flavors, reject unknown flavors, require `hydra_projection.trained_sample_count === 0` for granite (honest-untrained); wired into `verifyRoutingCalibration` via raw file read.

---

### Step 1: Bootstrap flag
**Status:** ✅ Complete

- [x] Add --encoder granite namespaced output
- [x] Document command in script header / STATUS

`scripts/bootstrap-routing-centroids.ts`: `--encoder minilm|granite` (default minilm) via `createTextEmbedder`; granite defaults to namespaced `config/routing-centroids.granite.json`; artifact JSON stamped with `encoder` flavor field; fail-fast on unknown encoder/flags; `main()` import-guarded for unit tests.

---

### Step 2: Verify reject mix
**Status:** ⬜ Not Started

- [ ] Reject mixed-encoder bundles
- [ ] Tests for reject path

---

### Step 3: Testing & Verification
**Status:** ⬜ Not Started

- [ ] Run npm run verify:ci

---
