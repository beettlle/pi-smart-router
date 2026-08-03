# SP-218: Train / Ship ModernBERT K=4 Heads Artifact — Status

**Current Step:** 3 (done)
**Status:** ✅ Complete (all criteria met)
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Train path + artifact or Partial

**Status:** ✅ Complete

- [x] Inspect privacy-safe training sources
- [x] Train script + ship `config/modernbert-k4-heads.json` **or** Partial writeup — Path (B): `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md`
- [x] Provenance recorded (blocker + operator-local path documented in Partial)
- [x] package.json script alias when train path exists — N/A (Path B: no train path, no data source)

**Plan-review checkpoint** — No invented weights; schema valid; defaults untouched.

## Step 2: Loader verification + tests

**Status:** ✅ Complete

- [x] DEFAULT path load non-null (or Partial documents null) — `loadModernBertK4HeadWeights()` returns `null` at DEFAULT path (Path B); placeholder fallback covered by test
- [x] Unit tests extended — temp-file round-trip + DEFAULT-path Partial test (25 tests green)
- [x] defaults.ts unchanged — `git diff main...HEAD` empty for defaults/release-gates

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract `testCommand` — typecheck clean, 25/25 modernbert-heads tests green
- [x] `npm run verify:ci` — build + typecheck + lint + coverage:check all pass (1850 tests)
- [x] coverage:check ≥77% — overall 93.04%, `modernbert-heads.ts` 90.24% lines
- [x] #114 comment posted (left open for SP-219); #96 untouched/open

---

## Completion Criteria

- [x] Heads loadable **or** Partial blocker documented — Path (B): `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md`
- [x] Train path or honest rationale — no privacy-safe [CLS] inputs or per-dim labels; operator-local training path documented
- [x] Tests green; defaults/gates untouched — 1850 tests pass; `git diff` empty for defaults.ts + release-gates.json
- [x] #114 open for SP-219; #96 open

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-08-03 | 1 | plan | SKIPPED (engine-owned; nested spawn blocked, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-08-03 | No privacy-safe source of [CLS] embeddings or per-dimension K=4 labels: label packs = feature vectors + binary `success` only (no 768-dim inputs); TwinRouterBench keeps `prefix_hash` only (no prompt text); `agent-turn-samples.json` has 20 prompts with no K=4 labels; ModernBERT ONNX not in local cache | Path (A) infeasible without inventing weights → Path (B) Partial writeup |

## Notes

Release v0.16.0 ModernBERT K=4 measurement theme. Serial before SP-219.
