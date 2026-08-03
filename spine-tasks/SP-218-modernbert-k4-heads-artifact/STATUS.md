# SP-218: Train / Ship ModernBERT K=4 Heads Artifact — Status

**Current Step:** 1
**Status:** 🔵 In Progress
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Train path + artifact or Partial

**Status:** 🔵 In Progress

- [x] Inspect privacy-safe training sources
- [x] Train script + ship `config/modernbert-k4-heads.json` **or** Partial writeup — Path (B): `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md`
- [x] Provenance recorded (blocker + operator-local path documented in Partial)
- [x] package.json script alias when train path exists — N/A (Path B: no train path, no data source)

**Plan-review checkpoint** — No invented weights; schema valid; defaults untouched.

## Step 2: Loader verification + tests

**Status:** ⬜ Not Started

- [ ] DEFAULT path load non-null (or Partial documents null)
- [ ] Unit tests extended
- [ ] defaults.ts unchanged

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand`
- [ ] `npm run verify:ci` if time allows
- [ ] coverage:check ≥77%
- [ ] #114 comment (do not close); #96 not closed

---

## Completion Criteria

- [ ] Heads loadable **or** Partial blocker documented
- [ ] Train path or honest rationale
- [ ] Tests green; defaults/gates untouched
- [ ] #114 open for SP-219; #96 open

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-08-03 | No privacy-safe source of [CLS] embeddings or per-dimension K=4 labels: label packs = feature vectors + binary `success` only (no 768-dim inputs); TwinRouterBench keeps `prefix_hash` only (no prompt text); `agent-turn-samples.json` has 20 prompts with no K=4 labels; ModernBERT ONNX not in local cache | Path (A) infeasible without inventing weights → Path (B) Partial writeup |

## Notes

Release v0.16.0 ModernBERT K=4 measurement theme. Serial before SP-219.
