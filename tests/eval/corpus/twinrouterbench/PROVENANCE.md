# TwinRouterBench static-track provenance (SP-186)

Pinned public source for converting TwinRouterBench `question_bank.jsonl` into
pi-smart-router `TwinRouterBenchStaticTrack` JSON (`scripts/eval/twinrouterbench-adapter.ts`).

**This directory does not yet vendor the full ~970-row corpus** (SP-187 vendors a
CI-sized subset). Operators convert offline from the pin below.

## Upstream pin

| Field | Value |
|-------|-------|
| GitHub | [CommonstackAI/TwinRouterBench](https://github.com/CommonstackAI/TwinRouterBench) |
| **Pinned commit** | `430acecac71141de77afd8e5e13690d236d58e93` (`main`, 2026-07-10) |
| Static paths | `data/static/question_bank.jsonl`, `data/static/manifest.json` |
| Manifest schema | `tier_only_question_bank` (970 lines; no model IDs in records) |
| License | **Apache-2.0** ([LICENSE](https://github.com/CommonstackAI/TwinRouterBench/blob/430acecac71141de77afd8e5e13690d236d58e93/LICENSE)) |
| Paper | [arXiv:2605.18859](https://arxiv.org/abs/2605.18859) |
| HF mirror | [`Amorph/TwinRouterBench`](https://huggingface.co/datasets/Amorph/TwinRouterBench) (Apache-2.0) |
| HF revision (informational) | `c2907f006455d9d3b4bf69472a527536c7baa195` (2026-05-23) — **older than the git pin**; prefer the git commit above for regeneration |

Fetch example (authoring / local only; CI must use a checked-in sample or SP-187 subset):

```bash
curl -fsSL \
  "https://raw.githubusercontent.com/CommonstackAI/TwinRouterBench/430acecac71141de77afd8e5e13690d236d58e93/data/static/question_bank.jsonl" \
  -o /tmp/trb-question_bank.jsonl
```

## Upstream fields used

| Upstream field | Use in converter |
|----------------|------------------|
| `id` | `trace_id` (stable row id) |
| `instance_id` | Session grouping; hashed into `session_id_hash` |
| `step_index` | Sort key within session (upstream is 1-based); reindexed to contiguous `0..n-1` after skips |
| `messages` | Prefix content for `prefix_hash` + token estimate; **not** stored in output |
| `target_tier` | Mapped via tier map below → `verified_target_tier` |
| `target_tier_id` | Consistency check against `target_tier` (skip row on mismatch) |
| `benchmark` | Maps to `benchmark_source` (`swebench` → `swe-bench-verified`; else `custom`) |
| `scenario` | **Workload proxy** — upstream has no `workload` field; documented here for operators |
| `pipeline_stage` | Verification flags only (see below); never invents tiers |

Ignored for conversion (not required): `notes`, `collector`, `collected_at`, `benchmark_*`, `functions`, `total_steps`.

### Prefix / messages hashing policy

- **`session_id_hash`**: `sha256("trb-session:" + instance_id)` hex digest (64 chars).
- **`prefix_hash`**: `sha256` of canonical JSON (`JSON.stringify`) of the row’s `messages` array (roles + content only). Messages are **not** written into the static-track document — only the digest and a character-based token estimate.
- **`prefix_token_estimate`**: `ceil(total_message_chars / 4)` heuristic. Not a model tokenizer score; not invented from labels.
- Raw prompt text is never written to training pipelines; this hash is eval-fixture identity only.

### Verification flags (no invented scores)

| `pipeline_stage` | `downgrade_cascade_verified` | `verified_tool_progression` |
|------------------|------------------------------|-------------------------------|
| `ground_truth_ready` | `true` | `true` |
| `mixed_model_validated` | `true` | `true` |
| `degradation_search_done` | `true` | `false` (weak-label / not formal GT) |
| anything else / missing | row **skipped** | — |

Unknown `target_tier` values are **skipped** (never invented). Schema-invalid JSONL lines fail the CLI.

## Tier map (upstream → `EvalTier`)

Upstream public tiers (`main/tiers.py`): `low` (0) < `mid` (1) < `mid_high` (2) < `high` (3).

Our eval harness has three `EvalTier`. Collapse is explicit and frozen:

| Upstream `target_tier` | Our `verified_target_tier` | Rationale |
|------------------------|----------------------------|-----------|
| `low` | `zero-tier` | Cheapest public tier |
| `mid` | `economical-cloud` | Mid capability / cost |
| `mid_high` | `frontier-cloud` | Stronger than mid; no fourth eval tier — map up (conservative for adequacy) |
| `high` | `frontier-cloud` | Strongest public tier |

Do **not** invent intermediate labels. Rows with any other `target_tier` string are dropped.

## Frozen catalog model IDs (`verified_target_model_id`)

Converter default catalog matches SP-153 sample fixtures (`catalog_id`: `pi-smart-router-v0.5.0-eval`, `checkpoint_date`: `2026-07-01`):

| `EvalTier` | `verified_target_model_id` |
|------------|----------------------------|
| `zero-tier` | `ollama/llama3.2:3b` |
| `economical-cloud` | `gpt-4o-mini` |
| `frontier-cloud` | `claude-sonnet-4` |

These IDs are **our** frozen eval catalog stand-ins, not TwinRouterBench dynamic-pool model IDs (`data/dynamic/tier_to_model.json`). Upstream static records are tier-only (`no_model_ids_in_records: true`).

## Converter

```bash
npx tsx scripts/eval/ingest-twinrouterbench-corpus.ts \
  --input /path/to/question_bank.jsonl \
  --output /tmp/trb-static-track.json \
  --limit 20
```

Optional npm script: `npm run routing:ingest-twinrouterbench -- --input … --output …`.

`--limit N` caps **emitted records** (CI-sized). Full corpus check-in is deferred to SP-187+.

## Related tasks

- **SP-187** — vendor CI-sized subset + checksums under this directory
- **SP-188** — CI smoke / gates docs (do not change absolute `config/release-gates.json` thresholds here)
