# SP-219: K=4 Top-1 + Offline A/B + Enablement Writeup — Status

**Current Step:** 3 (done)
**Status:** ✅ Complete (all criteria met)
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Top-1 + offline A/B measurements

**Status:** ✅ Complete

- [x] Confirm SP-218 heads load or Partial path — Partial confirmed: `loadModernBertK4HeadWeights()` returns `null` at DEFAULT path (verified 2026-08-03); SP-218 Partial `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md`
- [x] Top-1 / shortfall vs 0.1 on packs or documented proxy — trained-head Top-1 BLOCKED (no heads, no [CLS] inputs, no K=4 labels per SP-218); synthetic-proxy Top-1 measured via new `scoreHeadModeTop1` (formula + sample sizes recorded below)
- [x] Offline A/B beyond fixture QR; archive measurements — new `--k4-ab` CLI (trace fixtures + TwinRouterBench ci-subset, 148 steps / 68 sessions); archived `.pi-smart-router/measurements/sp-219/k4-head-mode-ab.json` (gitignored)
- [x] ECE PASS alone does not warrant K=4 — recorded explicitly in artifact recommendation table
**Measurement sources & sample sizes (plan-review checkpoint):**
- Trace fixtures: `tests/eval/fixtures/` top-level — 2 fixtures, 5 steps (`debug-session-cheap-escalation`, `trivial-pin-session`)
- TwinRouterBench ci-subset: `tests/eval/corpus/twinrouterbench/ci-subset.json` — 148 records / 68 sessions, execution-verified target tiers (downgrade-and-cascade); adapted via `adaptTwinRouterBenchStaticTrack`
- Local operator DB (`.pi-smart-router/state.db`): dataset/outcomes/telemetry all 0 rows — #96 Phase 1 proxy not computable locally
- Proxy caveat: embeddings are deterministic hash-derived synthetics (packs store `prefix_hash` only; text unrecoverable by design); K=4 side uses placeholder heads. Synthetic Top-1 error (0.885 on TRB subset, both modes identical) measures the hash pipeline, **not** trained-head quality → cannot evaluate the 0.1 gate; fixture-only parity (`qr_delta: 0`) remains insufficient per #96

**Plan-review checkpoint** — Sources + sample sizes recorded; no invented metrics.

## Step 2: Decision writeup + #96 link

**Status:** ✅ Complete

- [x] Write modernbert-k4-top1-artifact.md with recommendation — `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-top1-artifact.md`; recommendation: **keep default** (insufficient evidence for opt-in / flip)
- [x] defaults.ts / release-gates.json unchanged — `git diff` empty (verified 2026-08-03)
- [x] Comment #96; close #114; leave #96 open — #96 commented (issuecomment-5172555283, remains OPEN); #114 closed with AC disposition

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Artifact complete — Top-1 gate table + A/B evidence (sources, formulas, sample sizes) + blockers + recommendation in `modernbert-k4-top1-artifact.md`
- [x] Contract `testCommand` — typecheck clean; 25/25 `modernbert-heads.test.ts` green
- [x] Related eval tests — 48/48 green (`k4-head-mode-ab`, `eval-harness`, `tests/eval/**`)
- [x] verify:ci — build + typecheck + lint + coverage:check all pass (exit 0; 1856 tests)
- [x] Coverage: `npm run coverage:check` — overall 93.04% lines (≥77% gate)

---

## Completion Criteria

- [x] Top-1 measured or blocker documented — blocker documented (no trained heads / [CLS] inputs / K=4 labels / local outcome rows); synthetic-proxy formula + sample sizes recorded, no invented metrics
- [x] Offline A/B beyond fixtures (or proxy) — `--k4-ab` on trace fixtures (5 steps) + TwinRouterBench ci-subset (148 verified steps / 68 sessions); archived `.pi-smart-router/measurements/sp-219/`
- [x] Recommendation + #96 link; no default flip — keep default; #96 commented (OPEN); `git diff` empty for defaults.ts / release-gates.json
- [x] #114 closable; #96 open — #114 closed with AC disposition; #96 OPEN

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-08-03 | 1 | plan | SKIPPED (engine-owned; nested spawn blocked, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-08-03 | Local `.pi-smart-router/state.db` has 0 dataset/outcomes/telemetry rows | #96 Phase 1 outcome-linked proxy not computable in this worktree; documented as gap |
| 2026-08-03 | Hash-derived synthetic embeddings yield identical implied tiers for both head modes (agreement 1.0, qr_delta 0) and 0.885 synthetic Top-1 error vs verified tiers on TRB ci-subset | Confirms synthetic proxy carries no signal about verified tiers — cannot evaluate the 0.1 gate; enablement stays blocked on trained heads + real [CLS] inputs |

## Notes

Release v0.16.0. Depends on SP-218. Soft parent #96.
