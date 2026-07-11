# Label-pack corpus provenance (SP-189+)

Privacy-safe training packs for isotonic / OATS calibration. Artifacts contain
**feature vectors + binary outcomes only** — never raw prompt, message, or
patch text. Full upstream corpora are **not** vendored; CI uses tiny synthetic
fixtures under this directory.

Schema: `scripts/lib/label-pack-schema.ts` (rejects contrib taint keys).

---

## SWE-Gym (SP-189)

Verifier-grade success/fail labels for coding-agent trajectories, grounded in
[SWE-Gym](https://huggingface.co/datasets/SWE-Gym/SWE-Gym) executable tests
([arXiv:2412.21139](https://arxiv.org/abs/2412.21139)).

### Upstream pins

| Field | Value |
|-------|-------|
| Task corpus (HF) | [`SWE-Gym/SWE-Gym`](https://huggingface.co/datasets/SWE-Gym/SWE-Gym) |
| **Pinned revision** | `bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb` (2025-05-10) |
| License | **MIT** (`license:mit` on the dataset card) |
| Paper | [arXiv:2412.21139](https://arxiv.org/abs/2412.21139) |
| GitHub | [SWE-Gym/SWE-Gym](https://github.com/SWE-Gym/SWE-Gym) (Apache-2.0 code) |
| Verifier trajectories (HF) | [`SWE-Gym/OpenHands-Verifier-Trajectories`](https://huggingface.co/datasets/SWE-Gym/OpenHands-Verifier-Trajectories) |
| **Verifier pin** | `d47f6cab996d3a5f7ba517c0be57595f4f6201ce` |
| Verifier fields | `messages` (list of `{role, content}`), `resolved` (bool) |

The base task corpus has instance metadata (`instance_id`, `problem_statement`,
`patch`, …) but **no** binary resolve labels. Verifier training labels come from
trajectory datasets where `resolved` is set by the SWE-Gym test harness.

### Field map (verifier-style → label pack)

| Upstream / intermediate | Pack field | Notes |
|-------------------------|------------|-------|
| `resolved` / `success` / `success_label` | `success` | Required boolean; rows without it are **skipped** (never invented) |
| `instance_id` or `sample_id` | `sample_id` | Prefixed `swe-gym:`; otherwise hashed from non-text metadata |
| `features` (optional) | `features` | Finite numbers only; preferred when present |
| `messages` | *(derived only)* | Length / role stats → numeric features; **text discarded** |
| `tier` (optional) | `tier` | `zero-tier` \| `economical-cloud` \| `frontier-cloud` |
| — | `source` | Always `swe-gym` |
| — | `outcome_signals` | `verifier_resolved` or `verifier_failed` |
| `problem_statement`, `patch`, `hints_text`, `prompt`, `content` | **rejected** | Must not appear in pack JSONL |

### Privacy rules

1. Pack rows must pass `assertLabelPackRecordSafe` / `parseLabelPackRow`.
2. Keys matching contrib taint patterns (`prompt`, `messages`, `content`, secrets, …)
   are rejected (allowlist: P(success) length-norm feature names only).
3. Converter never writes message bodies, patches, or problem statements.
4. Do **not** check in the full HF parquet / trajectory dumps.

### CI fixture

| Field | Value |
|-------|-------|
| Path | `tests/eval/corpus/label-packs/swe-gym/ci-fixture.jsonl` |
| Rows | 4 synthetic verifier-style rows (2 resolved / 2 failed) |
| Purpose | Offline unit tests for `scripts/ingest-swe-gym-labels.ts` |

### Regenerate pack from local verifier JSONL (authoring only)

```bash
# Optional: download OpenHands verifier split locally (not for CI / not committed)
# huggingface-cli download SWE-Gym/OpenHands-Verifier-Trajectories \
#   --revision d47f6cab996d3a5f7ba517c0be57595f4f6201ce

npm run routing:ingest-swe-gym -- \
  --input /path/to/verifier-style.jsonl \
  --output /tmp/swe-gym-label-pack.jsonl \
  --limit 50
```

Offline CI path (checked-in fixture only):

```bash
npm run routing:ingest-swe-gym -- \
  --input tests/eval/corpus/label-packs/swe-gym/ci-fixture.jsonl \
  --output /tmp/swe-gym-pack.jsonl
```

---

## FC-RewardBench (SP-190)

Tool-call correct/incorrect preference pairs for function-calling reward models,
from [FC-RewardBench](https://huggingface.co/datasets/ibm-research/fc-reward-bench)
([ToolRM / arXiv:2509.11963](https://arxiv.org/abs/2509.11963)). Each upstream row
pairs a BFCL-derived **chosen** (correct) tool call with a model-generated
**rejected** (incorrect) call.

### Upstream pins

| Field | Value |
|-------|-------|
| Dataset (HF) | [`ibm-research/fc-reward-bench`](https://huggingface.co/datasets/ibm-research/fc-reward-bench) |
| **Pinned revision** | `269929c3329e603e87ed3203de42896cc03ddbf3` (2025-09-22) |
| License | **Apache-2.0** (`license:apache-2.0` on the dataset card) |
| Paper | [arXiv:2509.11963](https://arxiv.org/abs/2509.11963) (ToolRM) |
| Upstream fields | `tools`, `conversation`, `chosen_output`, `rejected_output`, `error_type`, `model_name`, `test_category`, `test_id` |

### Field map (preference / flat → label pack)

| Upstream / intermediate | Pack field | Notes |
|-------------------------|------------|-------|
| `chosen_output` arm | `success=true` | Emits one pack row per preference pair |
| `rejected_output` arm | `success=false` | Same pair; `outcome_signals` may include `error_type:…` |
| `label` / `success` / `correct` (flat) | `success` | Flattened rows; missing label → **skipped** (never invented) |
| `test_id` or `sample_id` | `sample_id` | Prefixed `fc-rewardbench:`; arms suffix `:chosen` / `:rejected` |
| `features` (optional) | `features` | Finite numbers only; preferred when present |
| `conversation`, `tools`, outputs | *(derived only)* | Length / count stats → numeric features; **text discarded** |
| `tier` (optional) | `tier` | `zero-tier` \| `economical-cloud` \| `frontier-cloud` |
| — | `source` | Always `fc-rewardbench` |
| `conversation`, `prompt`, `messages`, `content`, call bodies | **rejected** | Must not appear in pack JSONL |

### Privacy rules

1. Pack rows must pass `assertLabelPackRecordSafe` / `parseLabelPackRow`.
2. Converter never writes conversation turns, tool schemas, or call JSON bodies.
3. Do **not** check in the full HF arrow dump (`data/data-00000-of-00001.arrow`).

### CI fixture

| Field | Value |
|-------|-------|
| Path | `tests/eval/corpus/label-packs/fc-rewardbench/ci-fixture.jsonl` |
| Rows | 2 synthetic preference pairs + 2 flat labeled rows (+ 2 unmappable skips) |
| Purpose | Offline unit tests for `scripts/ingest-fc-rewardbench-labels.ts` |

### Regenerate pack from local JSONL (authoring only)

```bash
# Optional: download locally (not for CI / not committed)
# huggingface-cli download ibm-research/fc-reward-bench \
#   --revision 269929c3329e603e87ed3203de42896cc03ddbf3

npm run routing:ingest-fc-rewardbench -- \
  --input /path/to/fc-rewardbench-style.jsonl \
  --output /tmp/fc-rewardbench-label-pack.jsonl \
  --limit 50
```

Offline CI path (checked-in fixture only):

```bash
npm run routing:ingest-fc-rewardbench -- \
  --input tests/eval/corpus/label-packs/fc-rewardbench/ci-fixture.jsonl \
  --output /tmp/fc-rewardbench-pack.jsonl
```

---

## TwinRouterBench weak labels (SP-190)

Optional **weak** supervision derived from the landed TwinRouterBench static-track
corpus (`tests/eval/corpus/twinrouterbench/`, SP-186/187 / #101). Records already
store `prefix_hash` + `prefix_token_estimate` — **no prompt/prefix text** is
copied into pack artifacts.

### Weakness policy (read before using in calibration)

| Rule | Detail |
|------|--------|
| **What it is** | `verified_target_tier` is a routing-floor / downgrade-cascade proxy |
| **What it is not** | Not a SWE-Gym executable verifier grade; not FC-RewardBench tool-call correctness |
| **Binary map** | `zero-tier` / `economical-cloud` → `success=true` (cheap path adequate); `frontier-cloud` → `success=false` |
| **Holdout ECE** | **Exclude** these rows from holdout ECE / calibration dry-run metrics (SP-191). Pack rows carry `outcome_signals` including `weak_tier_proxy` and `exclude_from_holdout_ece` |
| **When to use** | Cheap volume for isotonic warm-start / OATS hints only; prefer verifier packs for reported ECE |

Upstream TwinRouterBench pins live in
[`tests/eval/corpus/twinrouterbench/PROVENANCE.md`](../twinrouterbench/PROVENANCE.md)
(git `430acecac71141de77afd8e5e13690d236d58e93`, Apache-2.0).

### Field map

| Upstream / intermediate | Pack field | Notes |
|-------------------------|------------|-------|
| `verified_target_tier` | `success` + `tier` | Weak map above; missing tier → **skipped** |
| `trace_id` | `sample_id` | Prefixed `twinrouterbench-weak:` |
| `prefix_token_estimate`, `turn_type`, `step_index`, `benchmark_source` | `features` | Numeric / categorical norms only |
| — | `source` | Always `twinrouterbench-weak` |
| — | `outcome_signals` | Always includes `weak_tier_proxy`, `exclude_from_holdout_ece` |
| prompt / prefix text | **never present** | Corpus + converter keep hashes only |

### CI fixture

| Field | Value |
|-------|-------|
| Path | `tests/eval/corpus/label-packs/twinrouterbench-weak/ci-fixture.jsonl` |
| Rows | 3 synthetic weak rows (zero / economical / frontier) + 2 skips |
| Also tested | Generate from `tests/eval/corpus/twinrouterbench/ci-subset.json` in unit tests (no prompt vendoring) |

```bash
npm run routing:ingest-twinrouterbench-weak -- \
  --input tests/eval/corpus/label-packs/twinrouterbench-weak/ci-fixture.jsonl \
  --output /tmp/trb-weak-pack.jsonl

# Or from static-track corpus subset (hashes only):
npm run routing:ingest-twinrouterbench-weak -- \
  --input tests/eval/corpus/twinrouterbench/ci-subset.json \
  --output /tmp/trb-weak-from-corpus.jsonl \
  --limit 50
```

---

## Calibration dry-run holdout ECE (SP-191)

Operators fit logistic + isotonic offline on pack rows and report **holdout ECE**
without writing prompt text into artifacts.

```bash
# Default: ingest checked-in CI fixtures in-memory (usually SAMPLE_STARVED / report-only)
npm run routing:calibration-dry-run

# Operator packs (schema-valid JSONL from the converters above)
npm run routing:calibration-dry-run -- --packs /tmp/swe-gym-pack.jsonl /tmp/fc-rewardbench-pack.jsonl
```

| Rule | Detail |
|------|--------|
| Soft ECE threshold | Advisory **0.25** calibrated holdout ECE (`CALIBRATION_DRY_RUN_SOFT_ECE_THRESHOLD`) — **not** a `config/release-gates.json` absolute |
| Sample-starved | &lt; 30 ECE-eligible rows → report-only (`SAMPLE_STARVED`); exit 0 |
| Weak labels | Rows with `exclude_from_holdout_ece` never enter holdout ECE metrics |
| #96 / `modernbert_k4` | Use pack holdout (verifier packs), not fixture-only QR, when deciding enablement — **do not** flip defaults here |
| Privacy | Dry-run loads via `loadLabelPackFile` / ingest converters; tainted keys fail closed |

Implementation: `scripts/verify-routing-calibration.ts` (`runCalibrationDryRunFromRows`, `--dry-run-packs`).
