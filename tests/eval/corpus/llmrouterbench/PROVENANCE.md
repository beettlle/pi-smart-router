# LLMRouterBench code/tool subset provenance (SP-192)

Pinned public source for converting LLMRouterBench outcome rows into
pi-smart-router `TwinRouterBenchStaticTrack` JSON (frozen-catalog eval schema via
`scripts/eval/twinrouterbench-adapter.ts` / `scripts/eval/llmrouterbench-adapter.ts`).

**CI-sized subset:** `ci-subset.json` — tiny synthetic offline fixture, checksummed below.
The full Hugging Face bundle (`bench-release.tar.gz`, ~1.28 GB / 400K+ instances) is
**not** checked in. Regenerate locally from authoring extracts with the converter
(`--limit` / code-tool filter). Do **not** change `config/release-gates.json` here.

## Upstream pin

| Field | Value |
|-------|-------|
| Hugging Face | [`NPULH/LLMRouterBench`](https://huggingface.co/datasets/NPULH/LLMRouterBench) |
| **Pinned HF revision** | `0e5af1b84bf73437a01a1849c0f1d2468baa93fc` (`main`, 2025-12-08) |
| Bundle | `bench-release.tar.gz` (~1.28 GB) — authoring only; **never vendor** |
| Bundle ETag (informational) | `b79f8cde1a6f029c2efa663a3a3b6f7748defb22341fe59f328cebef6648c8f1` |
| GitHub (schema / docs) | [ynulihao/LLMRouterBench](https://github.com/ynulihao/LLMRouterBench) |
| **Pinned git commit** | `c77cb0506949d8f959e97967d2fefca0e8ff1b05` (`main`, 2026-04-06) — BaselineRecord schema + README |
| Paper | [arXiv:2601.07206](https://arxiv.org/abs/2601.07206) (Findings of ACL 2026) |
| License | **MIT** (project README license badge / code). Dataset reuse: attribute per paper + HF card; do not redistribute the full release tarball in this repo. |

Fetch example (authoring / local only; CI must use the checked-in fixture):

```bash
# Prefer HF revision pin for the release bundle (large — do not commit):
# https://huggingface.co/datasets/NPULH/LLMRouterBench/resolve/0e5af1b84bf73437a01a1849c0f1d2468baa93fc/bench-release.tar.gz
#
# Schema reference (small):
curl -fsSL \
  "https://raw.githubusercontent.com/ynulihao/LLMRouterBench/c77cb0506949d8f959e97967d2fefca0e8ff1b05/baselines/schema.py" \
  -o /tmp/llmrouterbench-schema.py
```

## In-scope vs excluded slices

LLMRouterBench spans math, code, logic, knowledge, affective, instruction-following, and tool-use.
This converter keeps **code + tool** only (SP-192 / GitHub #103). Chat-only / MT-Bench-as-sole-metric
and non-agent slices are excluded.

| Slice | Upstream `dataset_id` (normalized) | In converter? |
|-------|-------------------------------------|---------------|
| Code | `humaneval`, `mbpp`, `livecodebench`, `swe-bench` / `swe_bench`, `studenteval` | **Yes** |
| Tool use | `tau2`, `tau-bench`, `tau2-bench` (τ²-Bench) | **Yes** |
| Math | `aime`, `math500`, `mathbench`, `livemathbench`, `finqa` | No |
| Logic / reasoning | `bbh`, `korbench`, `knights_knaves`, `arc-challenge`, `winogrande`, `gpqa`, `mmlu_pro` | No |
| Knowledge / QA | `simpleqa`, `medqa`, `truthfulqa`, `hle` | No |
| Affective / dialog | `emorynlp`, `meld`, `dailydialog` | No |
| Instruction / chat | `arenahard`, `mtbench`, `mt-bench`, `mt_bench` | No (chat-only) |

`--prefer-code-tool` (default for CI) skips any `dataset_id` not in the code/tool set.

## Upstream fields used

Input is JSONL of compact BaselineRecord-shaped objects (see upstream `baselines/schema.py`):

| Upstream field | Use in converter |
|----------------|------------------|
| `dataset_id` | Slice filter + `benchmark_source` map |
| `split` | Included in `trace_id` / session key (not invented) |
| `model_name` | Mapped via catalog map below; **unmappable → skip** |
| `record_index` | Stable index within dataset; part of `trace_id` |
| `origin_query` | Prefix hash + token estimate only; **not** stored in output |
| `prompt` | Optional alternate prefix text if `origin_query` empty |
| `score` | Success flag (`score >= 0.5`); **never invented** — missing/invalid → skip |
| `cost` | Passed through only when present as a finite number; never fabricated |
| `prompt_tokens` / `completion_tokens` | Prefer for `prefix_token_estimate` when present |

Ignored: `prediction`, `raw_output`, `ground_truth` (not required for static-track mapping).

### Prefix hashing policy

- **`session_id_hash`**: `sha256("lrb-session:" + dataset_id + ":" + split + ":" + record_index)` hex.
- **`prefix_hash`**: `sha256` of canonical JSON of `{ origin_query, prompt }` (strings only).
- **`prefix_token_estimate`**: `prompt_tokens` when a non-negative int is present; else `ceil(chars/4)` on query/prompt text.
- Raw prompts are never written into the static-track document.

## Model-ID → frozen catalog map + checkpoint policy

Default frozen catalog matches TwinRouterBench / SP-153 eval fixtures:

| Field | Value |
|-------|-------|
| `catalog_id` | `pi-smart-router-v0.5.0-eval` |
| `checkpoint_date` | `2026-07-01` |

| Upstream `model_name` (aliases) | Frozen `model_id` | `EvalTier` |
|---------------------------------|-------------------|------------|
| `Claude-sonnet-4`, `Claude-v4`, `claude-sonnet-4` | `claude-sonnet-4` | `frontier-cloud` |
| `gpt-4o-mini`, `GPT-4o-mini` | `gpt-4o-mini` | `economical-cloud` |
| `Llama-3.1-8B-Instruct`, `Llama-3.1-it`, `ollama/llama3.2:3b` | `ollama/llama3.2:3b` | `zero-tier` |

**Policy:**

1. Only the aliases above map. Every other upstream model (Gemini-*, GPT-5-*, Qwen3-235B, DeepSeek-*, …) is **skipped** — never invent a catalog stand-in.
2. Never invent `score` or `cost`. Rows missing a finite `score` are skipped. Catalog sticker prices are used only for eval-fixture cost estimates (same as TwinRouterBench), not as fabricated upstream costs.
3. Checkpoint date is frozen with the catalog; published QR/CS must cite `catalog_id` + `checkpoint_date`.
4. Failed scores (`score < 0.5`) still emit a record when the model maps, with `downgrade_cascade_verified=false` and `verified_tool_progression=false` so consumers do not treat failure as verified success.

## CI subset (SP-192)

| Field | Value |
|-------|-------|
| Path | `tests/eval/corpus/llmrouterbench/ci-subset.json` |
| **Max records** | **≤20** (`CI_SUBSET_MAX_RECORDS`) |
| Nature | Synthetic offline rows (not a slice of the 400K corpus) |
| Selection | Code (`livecodebench`, `swe-bench`, `humaneval`) + tool (`tau2`); chat-only excluded |
| SHA-256 | `1647fc918c76936e08cb70d4553989aebf7087cbc616c9fa9d1365709cb1fa03` |
| Vendored records | 5 (from `synthetic-upstream.jsonl` after code/tool + catalog filters) |

### Regenerate CI subset from synthetic upstream JSONL

```bash
npx tsx scripts/eval/ingest-llmrouterbench-subset.ts \
  --input tests/eval/corpus/llmrouterbench/synthetic-upstream.jsonl \
  --output tests/eval/corpus/llmrouterbench/ci-subset.json \
  --limit 20 \
  --prefer-code-tool

shasum -a 256 tests/eval/corpus/llmrouterbench/ci-subset.json
```

## Converter

```bash
npx tsx scripts/eval/ingest-llmrouterbench-subset.ts \
  --input /path/to/lrb-rows.jsonl \
  --output /tmp/lrb-static-track.json \
  --limit 20 \
  --prefer-code-tool
```

Optional npm script: `npm run routing:ingest-llmrouterbench -- --input … --output …`.

`--limit N` caps **emitted records**. `--prefer-code-tool` skips non-code/tool datasets (default on for CI authoring).

## Related tasks

- **SP-192** — pin + code/tool subset converter (this file)
- **SP-193** — regret / CS report CLI (do not implement here)
- **SP-194 / SP-195** — community-bench CLI (out of scope)
- TwinRouterBench static track — SP-186 / SP-187 (`tests/eval/corpus/twinrouterbench/`)
