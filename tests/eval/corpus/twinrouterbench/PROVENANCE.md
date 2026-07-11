# TwinRouterBench static-track provenance (SP-186 / SP-187 / SP-199)

Pinned public source for converting TwinRouterBench `question_bank.jsonl` into
pi-smart-router `TwinRouterBenchStaticTrack` JSON (`scripts/eval/twinrouterbench-adapter.ts`).

**CI-sized subset (SP-187 → SP-199):** `ci-subset.json` — ≤150 code/tool records, checksummed below.
The full ~970-row corpus is **not** checked in; regenerate locally with the converter
(`--limit` / no-limit). Sample fixtures under `tests/eval/fixtures/twinrouterbench/` are
unchanged and remain the default release-gate smoke inputs.

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

Fetch example (authoring / local only; CI must use the checked-in subset or sample fixtures):

```bash
curl -fsSL \
  "https://raw.githubusercontent.com/CommonstackAI/TwinRouterBench/430acecac71141de77afd8e5e13690d236d58e93/data/static/question_bank.jsonl" \
  -o /tmp/trb-question_bank.jsonl
```

Upstream JSONL SHA-256 (pinned commit, full 970 rows):

`5b4f90c24643b214a9b0f26bf4e05afc742554262f4ef405e0b3b4a4cce503f4`

## CI subset (SP-199)

| Field | Value |
|-------|-------|
| Path | `tests/eval/corpus/twinrouterbench/ci-subset.json` |
| **Max records** | **≤150** (`CI_SUBSET_MAX_RECORDS` in the converter) |
| Vendored records | 148 |
| Approx size | ~83 KB |
| Selection | `--prefer-code-tool` — keeps `swebench` / `bfcl` / `pinchbench`; skips chat-only (`mtrag`, `qmsum`); stratified quotas across the three code/tool benchmarks |
| SHA-256 | `c9a45d5bf25bb1e56d80d6a31dbd2b4c0fff02e4ba2a9e7a46565437ae97fdca` |

### Regenerate CI subset

```bash
curl -fsSL \
  "https://raw.githubusercontent.com/CommonstackAI/TwinRouterBench/430acecac71141de77afd8e5e13690d236d58e93/data/static/question_bank.jsonl" \
  -o /tmp/trb-question_bank.jsonl

# Optional: verify upstream pin checksum
shasum -a 256 /tmp/trb-question_bank.jsonl
# expect: 5b4f90c24643b214a9b0f26bf4e05afc742554262f4ef405e0b3b4a4cce503f4

npm run routing:ingest-twinrouterbench -- \
  --input /tmp/trb-question_bank.jsonl \
  --output tests/eval/corpus/twinrouterbench/ci-subset.json \
  --limit 150 \
  --prefer-code-tool

shasum -a 256 tests/eval/corpus/twinrouterbench/ci-subset.json
# expect: c9a45d5bf25bb1e56d80d6a31dbd2b4c0fff02e4ba2a9e7a46565437ae97fdca
```

Offline harness smoke on the corpus directory (does not touch default fixtures):

```bash
npm run routing:eval-harness -- --fixtures tests/eval/corpus/twinrouterbench --summary-only
```

## Upstream fields used

| Upstream field | Use in converter |
|----------------|------------------|
| `id` | `trace_id` (stable row id) |
| `instance_id` | Session grouping; hashed into `session_id_hash` |
| `step_index` | Sort key within session (upstream is 1-based); reindexed to contiguous `0..n-1` after skips |
| `messages` | Prefix content for `prefix_hash` + token estimate; **not** stored in output. String or multimodal `[{type:"text",text}]` parts are flattened |
| `target_tier` | Mapped via tier map below → `verified_target_tier` |
| `target_tier_id` | Consistency check against `target_tier` (skip row on mismatch) |
| `benchmark` | Maps to `benchmark_source` (`swebench` → `swe-bench-verified`; else `custom`); also drives `--prefer-code-tool` |
| `scenario` | **Workload proxy** — upstream has no `workload` field; documented here for operators |
| `pipeline_stage` | Verification flags only (see below); never invents tiers |

Ignored for conversion (not required): `notes`, `collector`, `collected_at`, `benchmark_*`, `functions`, `total_steps`.

### Prefix / messages hashing policy

- **`session_id_hash`**: `sha256("trb-session:" + instance_id)` hex digest (64 chars).
- **`prefix_hash`**: `sha256` of canonical JSON (`JSON.stringify`) of the row’s `messages` array (roles + flattened content only). Messages are **not** written into the static-track document — only the digest and a character-based token estimate.
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

CI subset (code/tool only, stratified, ≤150):

```bash
npm run routing:ingest-twinrouterbench -- \
  --input /tmp/trb-question_bank.jsonl \
  --output tests/eval/corpus/twinrouterbench/ci-subset.json \
  --limit 150 \
  --prefer-code-tool
```

Optional npm script: `npm run routing:ingest-twinrouterbench -- --input … --output …`.

`--limit N` caps **emitted records**. `--prefer-code-tool` skips chat-only benchmarks and
stratifies across swebench / bfcl / pinchbench when a limit is set.

## Related tasks

- **SP-186** — pin + converter (landed)
- **SP-187** — vendor CI-sized subset + checksums under this directory (landed; bound was ≤50)
- **SP-199** — raise CI subset bound 50→150 (this file)
- **SP-188** — CI smoke / gates docs (do not change absolute `config/release-gates.json` thresholds here)
- **SP-200** — full-track / nightly docs (owns README full-corpus guidance)
