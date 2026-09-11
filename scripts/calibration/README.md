# scripts/calibration — adversarial labeling harness (SP-282 / #169)

Adversarial LLM labeling campaign harness for post-1.0 verifier-graded
calibration (release v1.1.0). Replaces the abandoned scripted pack-intent
labeling (~94.5% positives → Sept isotonic collapse) with multi-model
generation + blinded LLM judges and hard campaign floors.

**Not shipped in the production bundle** — `scripts/` is outside
`package.json` `files`. This packet changes no `config/` artifacts; v1.0
honest-untrained neutralize stays in place until SP-284.

## Campaign contract (issue #169)

| Rule | Enforcement |
|------|-------------|
| Multi-model generators | `MIN_GENERATORS = 2`; duplicate ids rejected |
| 2–3 blinded graders, temp 0 | `MIN_GRADERS`/`MAX_GRADERS`; live grader posts `temperature: 0` |
| Generator excluded from grading | Per-generation grader pool filters out the generator's id; <2 remaining → fail loud |
| Blinding | Grader payload is exactly `{prompt_text, response_text}` (`assertGeneratorBlinded`); no generator identity or task metadata |
| ≥20% genuine negatives | `validateCampaignFloors` — invalid campaign → exit 1, **no pack files written** (report still emitted) |
| ≥5 distinct failure scores | Same floor check over `failure_score:<mean>` values |
| Session-level holdout | Seeded sha256 split (`assignSessionHoldout`); all rows of a session share a partition; holdout written to a separate file |
| No pre-labels / no coercion | Judge disagreements are excluded from labels and counted in the report; never majority-voted |
| `llm_judge` provenance | Every labeled row carries `outcome_signals` with `llm_judge`, `generator:<id>`, `grader:<id>` ×N, `dual_judge_agreement`/`multi_judge_agreement`, `judge_score:<mean>`, `failure_score:<mean>` (negatives), `session_fit`/`session_holdout` |
| Weak warm-start | `--warm-start-pack` rows must carry `exclude_from_holdout_ece` and join the **fit** file only (mirrors dry-run `--include-excluded-in-fit`) |

Labels land as privacy-safe label-pack JSONL (`scripts/lib/label-pack-schema.ts`)
— features + outcome only, never prompt/response text. Tainted keys fail
closed at task parse and again at pack serialization.

`llm_judge` rows count toward SP-281 ship floors (`human_feedback` |
`llm_judge` only) — but only from campaigns whose report says
`campaign_valid: true`. An invalid campaign writes no pack artifacts.

## Usage

Recorded (deterministic / CI / dry-run authoring):

```bash
npx tsx scripts/calibration/adversarial-label-campaign.ts \
  --input tasks.jsonl \
  --recorded recorded.jsonl \
  --generator gen-alpha --generator gen-beta \
  --grader grader-one --grader grader-two \
  --output /tmp/adversarial-fit.jsonl \
  --holdout-output /tmp/adversarial-holdout.jsonl \
  --report /tmp/adversarial-report.json
```

Live (OpenAI-compatible chat endpoints; graders pinned to temp 0):

```bash
export ADVERSARIAL_LABEL_API_KEY=…
npx tsx scripts/calibration/adversarial-label-campaign.ts \
  --input tasks.jsonl \
  --generator gen-a=gpt-5.5@https://api.example/v1 \
  --generator gen-b=claude-sonnet@https://api.example/v1 \
  --grader judge-1=model@https://api.example/v1 \
  --grader judge-2=model@https://api.example/v2 \
  --output fit.jsonl --holdout-output holdout.jsonl --report report.json \
  --warm-start-pack /tmp/trb-weak-from-ci-subset.jsonl
```

### Task input (`--input`, operator-local, never committed with real prompts)

```json
{"task_id":"t1","session_id":"sess-1","tier":"economical-cloud","prompt_text":"…","features":{"prompt_length_norm":0.3, …}}
```

`prompt_text` is used for generation/grading only — it never appears in
pack output (schema taint scan + serialization leak check).

### Recorded replay (`--recorded`)

```json
{"kind":"generation","task_id":"t1","client_id":"gen-alpha","response_text":"…"}
{"kind":"grade","task_id":"t1","client_id":"grader-one","generator_id":"gen-alpha","score":8}
```

`generator_id` on grade rows is replay routing metadata only — it is never
included in the grader payload. Missing entries fail loud (exit 1) — the
harness never invents labels.

CI fixture: `tests/eval/corpus/label-packs/adversarial-llm-judge/`
(synthetic tasks + recorded campaign; see
`tests/eval/corpus/label-packs/PROVENANCE.md`).

## Authoring rules (from #169)

- Do not pre-label packs as good/bad without graders.
- Do not keyword-stuff tasks solely to hit triage floors.
- Do not ship campaign output into `config/` here — SP-283 trains,
  SP-284 hard-gates the ship bundle.
