# SP-259 — Pin ONNX artifacts by SHA-256 + verify on load — Status

**Current Step:** Complete — all steps done
**Status:** Complete
**Last Updated:** 2026-09-05
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Locate cache/model ids
- [x] Choose pin config location

## Step 1: Digest pin + verify

**Status:** Complete

- [x] Add digests + verify
- [x] Fail closed on mismatch

## Step 2: Testing & Verification

**Status:** Complete

- [x] Unit tests green
- [x] Contract testCommand green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-05 | Cache path: `hydra.artifact_cache_path` (default `.pi-smart-router/models/`) passed as `cache_dir` to transformers.js pipeline; model ids `Xenova/all-MiniLM-L6-v2`, `onnx-community/granite-embedding-97m-multilingual-r2-ONNX`. transformers.js FS cache layout: `<cacheDir>/<modelId>/<filePath>` (hub-style `models--org--name/snapshots/<rev>/` fallback supported). | Verification targets `<cache>/<modelId>/<relPath>` |

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-05 | Step 0 complete | cache path + model ids located; pin config location = dedicated file `config/onnx-artifact-pins.json` + env activation |
| 2026-09-05 | Plan review step 1 | skipped by engine (real-pi worker session; engine runs reviews post-.DONE) |
| 2026-09-05 | Step 1 complete | `verifyOnnxArtifactPins` + factory wiring in embedding-provider.ts; pins landed; typecheck + 28/28 unit tests green |
| 2026-09-05 | Step 2 complete | Contract `npm run typecheck && npx vitest run tests/unit/embedding-provider.test.ts` green (28/28). Full `npm test`: 2151/2152 — sole failure `write-queue-lag.test.ts` is an unrelated SP-236 event-loop timing benchmark flake (passes in isolation; not touched by this change). `npm run coverage:check` exit 0; embedding-provider.ts 94.05% lines / 100% funcs. GitNexus detect_changes: medium risk, changes confined to embedding-provider.ts as scoped. |

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

- **Pin config location (Step 0 decision):** dedicated pin file `config/onnx-artifact-pins.json` (version + per-model relative-path → SHA-256 map). Rationale: `src/domain/matching/hydra-matcher.ts` and `src/domain/types/schemas.ts` are outside File Scope, so operator-config schema plumbing is not possible; activation is via env vars `SMART_ROUTER_ONNX_PIN_MODE` (`off`\|`verify`\|`enforce`, default `off`) and `SMART_ROUTER_ONNX_PIN_FILE`, plus an optional programmatic options param on the embedder factories.
- **Real digests:** pinned `onnx/model_quantized.onnx` (transformers.js default q8 artifact) for both models, SHA-256 from HuggingFace API LFS `oid` (2026-09-05): MiniLM `afdb6f1a…bdb1`, Granite `704c1ebc…2e22`.
- **Impact analysis (GitNexus, pre-edit):** `createOnnxFeatureEmbedder` blast radius HIGH — 8 symbols, 4 processes (hydra-matcher factories, benchmark/bootstrap scripts). Mitigation: changes are additive-only; existing call signatures remain valid; verification default-off.

