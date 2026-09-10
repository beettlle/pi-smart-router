# Release v1.0.1 — verifier-graded calibration train

**Approved scope:** post-1.0 recalibration after v1.0 honesty neutralize.
**Parent issues:** #110, #168, #169, #170, #171, #172 (baseline optional).
**Packets:** SP-280 → SP-286 (`Next Task ID` starts SP-287 after authoring).

| ID | Size | Mission | GitHub |
|----|------|---------|--------|
| SP-280 | S | Manifest + CONTEXT + deps scaffold | — |
| SP-281 | M | Label provenance (`human_feedback` \| `llm_judge` \| `scripted_intent`); floors ignore scripted | #168 |
| SP-282 | M | Adversarial labeling harness | #169 |
| SP-283 | M | Aggregate + train on verifier-grade set only | #168 |
| SP-284 | M | Hard-gate verify + ship candidate bundle | #168 |
| SP-285 | M | Privacy-safe embedding export for HyDRA | #170 |
| SP-286 | S | Operator notes linking issues; no #96 flip | #110 |

**Do not** `spine batch start` until operator schedules the train. Authoring-only until then.
