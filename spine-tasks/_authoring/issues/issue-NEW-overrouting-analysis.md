# NEW ISSUE — TwinRouterBench over-routing analysis

**Suggested title:** Analyze TwinRouterBench CI corpus over-routing (~0.85 vs 0.15 gate)

**Suggested labels:** investigation, eval, routing

**Action:** Create a new GitHub issue. Feeds #95 public-track readiness. Do **not** change absolute gates without operator approve.

---

## Problem

`npm run routing:assert-release-gates:corpus-report` intentionally soft-fails: corpus `mean_over_routing_rate` ≈ 0.85 vs absolute max 0.15. Until root-caused, public static-track claims and threshold decisions are guesswork. Possible drivers: triage conservatism, pattern-default profiles, P(success) / shortfall thresholds, fixture min_tier labels, or fleet mapping.

## Acceptance criteria

- [ ] Reproduce soft-report numbers on current HEAD; archive output.
- [ ] Break down over-routing by stage / reason_code / min_tier / selected tier (scripted analysis preferred).
- [ ] Identify top 2–3 root causes with evidence (not speculation only).
- [ ] Recommend one of: routing/threshold fix PR, profile grounding fix, **or** operator-approved soft-threshold policy — without editing absolute gates in the analysis PR unless separately approved.
- [ ] Write short report artifact under `spine-tasks/_authoring/` or `docs/` linked from this issue and #95.
- [ ] Explicit: analysis PR must not silently move corpus into hard `release:functional-smoke`.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Approve any gate threshold change | Human operator |
| Reproduce, analyze, report, optional fix PR | Autonomous |

## Commands / files

- `npm run routing:assert-release-gates:corpus-report`
- `npm run routing:eval-harness:corpus-smoke`
- `tests/eval/corpus/twinrouterbench/`
- `scripts/eval/harness-tracks.ts`
- `scripts/eval/assert-release-gates.ts`
- `config/release-gates.json` (read-only unless approved)

## Out of scope

- Human live dogfood sessions (see QA protocol / #95)
- Track B adapter implementation
- Encoder default flips

## Links

- #95 soft-feed parent
- `docs/qa/shadow-dogfood-protocol.md`
