## Summary

Measure typed judgment against the current MiniLM projection on the existing eval harness, offline in CI, and produce a decision artifact. Epic: {{EPIC}}.

## Priority

P1

## Pipeline stages

Eval only: `scripts/eval/run-harness.ts`, `scripts/eval/counterfactual-replay.ts`, TwinRouterBench corpus (`tests/eval/corpus/twinrouterbench`).

## Problem / motivation

Incident replays (epic) are six cases. Defaults must not change on anecdotes (same rule as #96: fixture-only results are insufficient). The judge also varied with question wording, so the question set must be measured, not assumed.

## Proposed solution

- [ ] **Record script** (e.g. `scripts/eval/record-typed-judgments.ts`): runs the state builder over harness fixtures, calls the configured endpoint, writes a versioned answer cache (keyed by fixture id + question-set hash + model id). Cache is checked in so **CI never calls a judge**.
- [ ] Harness flag (e.g. `--requirements-source jev --judgment-cache <path>`) that replays cached answers through the real pipeline.
- [ ] Runs: TwinRouterBench corpus smoke + counterfactual replay, for `projection` vs `jev`, and tier-hint consumers on/off.
- [ ] **Ablation:** six-question set vs. six + `complexity` (pi-jev's original four included it; it agreed with `capability_deserved` in every replayed case).
- [ ] Metrics: quality retention, over-routing rate (#112, current soft report ~0.85 vs 0.15 gate), misroute deltas by stage.
- [ ] Latency benchmark (pattern of `npm run benchmark:encoder`): p50/p95 cold vs warm, short vs ~500-token state, against the configured endpoint; record hardware.
- [ ] Decision artifact under `spine-tasks/_authoring/` linked from the epic, #96, #167, #110: keep / opt-in / propose default for `requirements_source` and tier hints.

## Evidence

Local OpenJev measurements (epic): ~385 ms cold short state, ~832 ms with long rubrics, 3.6–4.3 s at ~3k tokens on Apple silicon; 27–31 ms GPU per OpenJev README.

## Dependencies

| Issue | Role |
|-------|------|
| {{T2}} | State builder + questions (needed to record) |
| {{T5}} | Tier-hint consumers (measured) |
| {{T6}} | HyDRA requirement source (measured) |

## Out of scope

- Flipping defaults or editing absolute `config/release-gates.json` (operator approval, separate PR).
- Live dogfood (#95 protocol).

## Verification

```bash
npm run routing:eval-harness:corpus-smoke
npm run routing:eval-harness -- --requirements-source jev --judgment-cache <path>
npm run routing:assert-release-gates:corpus-report
```

- CI job runs offline from the cache; cache-miss is a hard error, not a silent fallback.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Record answers (needs judge endpoint) | Operator |
| Harness flag, ablation, report | Autonomous |
| Default decision | Operator |
