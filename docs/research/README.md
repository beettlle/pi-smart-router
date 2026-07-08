# Research Provenance Index

This folder holds **machine-readable research outputs**. The **actionable implementation backlog** lives in [`../routing-roadmap.md`](../routing-roadmap.md) — start there for priorities, pipeline mapping, and spine follow-ons. **Execution tracking:** open GitHub issues [#71–#84](https://github.com/beettlle/pi-smart-router/issues?q=is%3Aissue+is%3Aopen+routing%3A+P+in%3Atitle) (`routing: P0|P1|P2|P3 —` titles).

## Sources

| Artifact | Type | Date | Description |
|----------|------|------|-------------|
| [`routing-quality-2026-07.json`](routing-quality-2026-07.json) | Parallel deep-research JSON | 2026-07-07 | Run `trun_7b47ebd495b54ca1947d8f81226bce7c`; processor `pro-fast` |
| [`../gemini-research.md`](../gemini-research.md) | Second-source report | 2026-07 | Agent-native techniques: sub-agent planning, OATS, UCCI, TwinRouterBench, Granite encoder |

## How sources relate

```text
deep-research.md (survey) ──┐
routing-quality JSON ───────┼──► routing-roadmap.md (authoritative backlog)
gemini-research.md ─────────┘
         │
         └── PRD.md (pipeline contract; unchanged by research)
```

Do **not** duplicate JSON content into markdown. Agents may read `content.*` fields in the JSON for citations and verbatim research answers; humans and implementers use the roadmap for sequencing.

## JSON structure (`routing-quality-2026-07.json`)

Top-level fields under `output.content`:

| Field | Topic |
|-------|--------|
| `executive_insights` | Summary bullets |
| `q1_turn_type_vs_session_pin_tension_*` | Planning vs session pin |
| `q2_grounding_capability_scores_*` | Benchmark-grounded profiles |
| `q3_hydra_fidelity_*` | Encoder / projection architecture |
| `q4_p_success_labels_*` | Outcome signals for agents |
| `q5_evaluation_methodology_*` | Agentic eval suites |
| `q6_semantic_clustering_*` | Cluster / tier hints |
| `q7_subscription_quota_economics_*` | Virtual cost modeling |
| `q8_adversarial_robustness_*` | Embedding router defenses |
| `q9_when_is_routing_the_wrong_abstraction_*` | Pin-only vs multi-stage |
| `per_stage_recommendations` | Pipeline-stage actions |
| `top_5_priority_changes_*` | Highest-leverage changes |
| `gap_analysis_*` | vs existing architecture |
| `annotated_bibliography_50_sources` | Full source list |
| `viability_assessment_*` | Multi-stage pre-gen verdict |
| `synthesis` | Cross-cutting comparison table |

`output.basis` contains per-field citations and confidence metadata from the parallel research run.

## Reconciliation

Merged decisions from both sources (planning sub-agent vs buffer, isotonic P(success), OATS, Granite before ModernBERT, deferred SeqRoute RL) are documented in [`../routing-roadmap.md`](../routing-roadmap.md) §6.
