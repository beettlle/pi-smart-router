# SP-219: K=4 Top-1 + Offline A/B + Enablement Writeup — Status

**Current Step:** 1
**Status:** 🔄 In Progress
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Top-1 + offline A/B measurements

**Status:** 🔄 In Progress

- [x] Confirm SP-218 heads load or Partial path — Partial confirmed: `loadModernBertK4HeadWeights()` returns `null` at DEFAULT path (verified 2026-08-03); SP-218 Partial `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md`
- [x] Top-1 / shortfall vs 0.1 on packs or documented proxy — trained-head Top-1 BLOCKED (no heads, no [CLS] inputs, no K=4 labels per SP-218); synthetic-proxy Top-1 measured via new `scoreHeadModeTop1` (formula + sample sizes recorded below)
- [x] Offline A/B beyond fixture QR; archive measurements — new `--k4-ab` CLI (trace fixtures + TwinRouterBench ci-subset, 148 steps / 68 sessions); archived `.pi-smart-router/measurements/sp-219/k4-head-mode-ab.json` (gitignored)
- [ ] ECE PASS alone does not warrant K=4 — statement recorded in artifact (Step 2)

**Measurement sources & sample sizes (plan-review checkpoint):**
- Trace fixtures: `tests/eval/fixtures/` top-level — 2 fixtures, 5 steps (`debug-session-cheap-escalation`, `trivial-pin-session`)
- TwinRouterBench ci-subset: `tests/eval/corpus/twinrouterbench/ci-subset.json` — 148 records / 68 sessions, execution-verified target tiers (downgrade-and-cascade); adapted via `adaptTwinRouterBenchStaticTrack`
- Local operator DB (`.pi-smart-router/state.db`): dataset/outcomes/telemetry all 0 rows — #96 Phase 1 proxy not computable locally
- Proxy caveat: embeddings are deterministic hash-derived synthetics (packs store `prefix_hash` only; text unrecoverable by design); K=4 side uses placeholder heads. Synthetic Top-1 error (0.885 on TRB subset, both modes identical) measures the hash pipeline, **not** trained-head quality → cannot evaluate the 0.1 gate; fixture-only parity (`qr_delta: 0`) remains insufficient per #96

**Plan-review checkpoint** — Sources + sample sizes recorded; no invented metrics.

## Step 2: Decision writeup + #96 link

**Status:** ⬜ Not Started

- [ ] Write modernbert-k4-top1-artifact.md with recommendation
- [ ] defaults.ts / release-gates.json unchanged
- [ ] Comment #96; close #114; leave #96 open

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Artifact complete
- [ ] Contract `testCommand`
- [ ] Related eval tests if touched
- [ ] verify:ci / coverage as applicable

---

## Completion Criteria

- [ ] Top-1 measured or blocker documented
- [ ] Offline A/B beyond fixtures (or proxy)
- [ ] Recommendation + #96 link; no default flip
- [ ] #114 closable; #96 open

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.16.0. Depends on SP-218. Soft parent #96.
