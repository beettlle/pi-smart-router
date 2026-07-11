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
