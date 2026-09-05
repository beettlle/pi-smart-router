# SP-260 — Real embedder dispose() + lifecycle tests — Status

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

- [x] Inspect dispose stub
- [x] Identify callers

## Step 1: Real dispose

**Status:** Complete

- [x] Implement release path
- [x] Wire callers if needed

## Step 2: Testing & Verification

**Status:** Complete

- [x] Lifecycle tests green
- [x] Contract testCommand green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-05 | Step 0 complete | Dispose stub at embedding-provider.ts:277-279 is a no-op comment. Upstream @huggingface/transformers v4 (dep ^4.2.0) provides `pipeline.dispose()` (Promise<void>) and `model.dispose()` fallback — real release path exists. Callers already delegate: HydraMatcher.dispose → EmbeddingProvider.dispose (wrapHydraEmbeddingProvider) → TextEmbedder.dispose; no wiring change needed. Decision: post-dispose `embed()` fails closed (no silent recreate of ONNX sessions). |
| 2026-09-05 | Step 1 complete | Real dispose: pipeline.dispose() primary, model.dispose() fallback, fail-loud error when no handle (no silent no-op). Idempotent dispose for shared-factory callers. Post-dispose embed() fails closed. Release failures propagate AND embed stays closed. Existing pipeline mocks in hydra-matcher.test.ts / embedding-provider.test.ts given dispose handles (May-change scope). |
| 2026-09-05 | Step 2 (partial) | New tests/unit/embedder-dispose-lifecycle.test.ts (9 tests) green; contract testCommand (typecheck + 3 files) green: 98/98. Full npm test running. |
| 2026-09-05 | Step 2 complete | Contract testCommand green (typecheck + 98/98 in scope files). Full `npm test` green: 121 files, 2164/2164 passed. Task complete; #147 lifecycle half delivered (docs half is SP-261). |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes


- 2026-09-05: Contract fileScopeMustChange redirected to tests/unit/embedding-provider.test.ts (SP-259 pre-landed embedding-provider.ts).

- 2026-09-05: fileScopeMustChange → tests/unit/embedder-dispose-lifecycle.test.ts (new); aborted batch 20260905T190315-7d04 for restart.
