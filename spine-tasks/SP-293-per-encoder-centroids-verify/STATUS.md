# SP-293: per-encoder centroids + cal verify — Status

**Current Step:** Done
**Status:** ✅ Complete
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
**Status:** ✅ Complete

- [x] Reject mixed-encoder bundles
- [x] Tests for reject path

`scripts/verify-routing-calibration.ts`: `assertEncoderFlavorConsistency(rawBundle)` + `assertEncoderFlavorConsistencyFromFile(path)` — raw-JSON check (zod strips unknown keys); missing `encoder` ⇒ implicit minilm; unknown flavors + unparseable bundles fail closed (SP-252); non-minilm bundles must keep `hydra_projection.trained_sample_count=0` (honest-untrained; MiniLM weights never reused as granite). Wired into `verifyRoutingCalibration`. Tests: 10 new in `verify-routing-calibration.test.ts`, 3 in `train-routing-calibration.test.ts` (contract file), 6 in new `bootstrap-routing-centroids.test.ts` — 58/58 green across the three files.

---

### Step 3: Testing & Verification
**Status:** ✅ Complete

- [x] Run Contract `testCommand` (typecheck + scoped calibration/verify tests); full `verify:ci` is post-integrate on `main`

**Evidence:**
- Contract `npm run typecheck && npx vitest run tests/unit/train-routing-calibration.test.ts` → typecheck clean, 32/32 pass.
- Scoped suite: 58/58 across `bootstrap-routing-centroids`, `verify-routing-calibration`, `train-routing-calibration` test files.
- Shipped bundle end-to-end: `npm run routing:verify-calibration` → 20/20 PASS incl. `encoder_flavor_consistency: encoder=minilm` (shipped MiniLM defaults untouched; no cascade flip).
- Per in-lane note, full `verify:ci` left as post-integrate gate (coverage flake risk under load).

**Completion criteria:** `--encoder granite` emits flavored namespaced artifact ✓; verify rejects cross-encoder mixes ✓; Granite projection honest-untrained gate ✓.

---
