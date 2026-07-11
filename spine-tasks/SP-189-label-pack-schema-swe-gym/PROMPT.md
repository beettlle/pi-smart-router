# Task: SP-189 — Label Pack Schema + SWE-Gym Ingest

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Define privacy-safe public label-pack schema and SWE-Gym verifier-label converter for isotonic/OATS training volume.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#102
- Bucket: feature
- Partial: #102 (schema + SWE-Gym; FC-RewardBench + wire-up in SP-190/SP-191)
- Release: v0.9.2

## Mission

Partial #102 — #74/#77 landed calibrator and OATS hooks but lack verifier-grade label volume. Add a **privacy-safe label-pack schema** (feature vectors + binary outcomes only; **no raw prompt text** in train artifacts) and an offline converter from [SWE-Gym](https://huggingface.co/datasets/SWE-Gym/SWE-Gym) verifier-style success/fail labels into that schema. Pin provenance/license. Ship a tiny CI fixture + unit tests that reject prompt leakage. Do **not** vendor the full SWE-Gym corpus; do **not** change `config/release-gates.json` thresholds; do **not** implement FC-RewardBench or calibration dry-run (SP-190/SP-191).

## Dependencies

- **None** (builds on landed SP-117 / #74 / #77; TwinRouterBench weak labels optional in SP-190)

## Context to Read First

- `scripts/calibration-aggregate.ts` — contrib reject/strip keys, `MINIMUM_TRAINING_SAMPLES`, `parseContribJsonl`
- `scripts/train-routing-calibration.ts` — train consumers / isotonic + OATS
- `scripts/lib/isotonic-calibrator.ts`
- `scripts/lib/oats-centroid-refinement.ts` — min positive/negative sample guards
- `src/domain/routing/p-success-classifier.ts` — `LabeledTrainingSample`, `parseTrainingExportLine`
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` — provenance pattern to mirror
- GitHub #102 acceptance (SWE-Gym ingest + privacy schema)

## Environment

- **Workspace:** `scripts/`, `tests/eval/corpus/`, `tests/unit/`
- **Services required:** None (network only for optional one-shot pin fetch during authoring; CI path must work offline from checked-in fixtures)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/label-pack-schema.ts`, `scripts/ingest-swe-gym-labels.ts`, `tests/eval/corpus/label-packs/PROVENANCE.md` |
| May change | `tests/unit/label-pack-schema.test.ts`, `tests/unit/ingest-swe-gym-labels.test.ts`, `tests/eval/corpus/label-packs/swe-gym/*.jsonl`, `package.json` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/label-pack-schema.test.ts tests/unit/ingest-swe-gym-labels.test.ts` |
| fileScopeMustChange | `scripts/lib/label-pack-schema.ts`, `scripts/ingest-swe-gym-labels.ts`, `tests/eval/corpus/label-packs/PROVENANCE.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Privacy-safe schema rejects prompt/message keys; SWE-Gym converter maps verifier outcomes → pack rows; provenance pinned; CI fixture offline; no full corpus vendored. |

## Steps

### Step 1: Privacy-safe label-pack schema

- [ ] Add `scripts/lib/label-pack-schema.ts` with Zod (or existing validation style) for pack rows: features + binary outcome (+ optional tier/cluster metadata); **reject** any key matching contrib taint patterns (`prompt`, `messages`, `content`, secrets)
- [ ] Export load/validate helpers usable by ingest scripts and later calibration dry-run
- [ ] Unit tests: accept clean row; reject rows with prompt/message fields; assert serialized artifacts never contain raw prompt text

### Step 2: SWE-Gym pin + converter

- [ ] Record pinned SWE-Gym HF revision (or git) + license in `tests/eval/corpus/label-packs/PROVENANCE.md`
- [ ] Add `scripts/ingest-swe-gym-labels.ts` (npm script optional) that converts verifier-style success/fail into label-pack JSONL; support `--limit N`; skip unmappable rows; never invent outcomes
- [ ] Check in a tiny synthetic/CI fixture under `tests/eval/corpus/label-packs/swe-gym/` (not full dataset)
- [ ] Unit tests: synthetic upstream row → valid pack document loadable by schema helpers

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/label-packs/PROVENANCE.md` — SWE-Gym pin, license, field map, privacy rules *(also in File Scope)*

**Check If Affected:**
- `docs/routing-roadmap.md` — only if §2 P1/P2 label-volume wording is stale
- `config/routing-calibration.json.example` — advisory only this task

## Completion Criteria

- [ ] Label-pack schema rejects prompt leakage
- [ ] SWE-Gym converter produces valid pack rows offline
- [ ] Provenance + pin documented
- [ ] Full SWE-Gym corpus not vendored
- [ ] Gate thresholds untouched
- [ ] Contract + full suite green

## Git Commit Convention

- `feat(SP-189): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Implement FC-RewardBench ingest or TwinRouterBench weak labels (SP-190)
- Wire calibration dry-run / ECE reporting (SP-191)
- Change `config/release-gates.json` absolute thresholds
- Re-open or implement #1, #25, #26 (hardware dogfood)
- Vendor full HuggingFace datasets into the repo

## Amendments

None.
