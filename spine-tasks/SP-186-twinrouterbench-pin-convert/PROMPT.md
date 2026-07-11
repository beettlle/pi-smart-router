# Task: SP-186 — TwinRouterBench Pin + Convert Script

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Pin public TwinRouterBench static-track source and add an offline converter into our adapter schema.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#101
- Bucket: feature
- Partial: #101 (pin + convert; subset + gates in SP-187/SP-188)
- Release: v0.9.1

## Mission

Partial #101 — #79 shipped a TwinRouterBench-*compatible* adapter with two sample fixtures. Operators need a **pinned** public static-track source and a converter from upstream `question_bank.jsonl` (CommonstackAI/TwinRouterBench `data/static/` or HF `Amorph/TwinRouterBench`) into our `TwinRouterBenchStaticTrack` schema (`scripts/eval/twinrouterbench-adapter.ts`). Document license/provenance and a stable tier map (upstream `low|mid|mid_high|high` → our `zero-tier|economical-cloud|frontier-cloud`). Do **not** vendor the full ~970-row corpus in this task; do **not** change `config/release-gates.json` thresholds.

## Dependencies

- **None** (builds on landed SP-153 / #79)

## Context to Read First

- `scripts/eval/twinrouterbench-adapter.ts` — target schema + adapter
- `tests/eval/fixtures/twinrouterbench/*.json` — sample shape
- `tests/eval/twinrouterbench-adapter.test.ts`
- GitHub #101 acceptance (pin + convert)
- Upstream: https://github.com/CommonstackAI/TwinRouterBench (`data/static/question_bank.jsonl`, `manifest.json`); HF mirror `Amorph/TwinRouterBench`

## Environment

- **Workspace:** `scripts/eval/`, `tests/eval/`
- **Services required:** None (network only for optional one-shot pin fetch during authoring; CI path must work offline from a checked-in sample row or recorded snippet)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/ingest-twinrouterbench-corpus.ts`, `tests/eval/corpus/twinrouterbench/PROVENANCE.md` |
| May change | `scripts/eval/twinrouterbench-adapter.ts`, `tests/eval/twinrouterbench-adapter.test.ts`, `tests/unit/ingest-twinrouterbench-corpus.test.ts`, `package.json` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/eval/twinrouterbench-adapter.test.ts tests/unit/ingest-twinrouterbench-corpus.test.ts` |
| fileScopeMustChange | `scripts/eval/ingest-twinrouterbench-corpus.ts`, `tests/eval/corpus/twinrouterbench/PROVENANCE.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Pinned upstream commit/tag documented; converter maps question_bank rows → TwinRouterBenchStaticTrack; tier map documented; unit tests cover conversion without inventing scores; no full corpus vendored yet. |

## Steps

### Step 1: Pin upstream + provenance

- [ ] Record pinned TwinRouterBench git commit/tag (or HF revision) + license/provenance in `tests/eval/corpus/twinrouterbench/PROVENANCE.md`
- [ ] Document upstream fields used (`target_tier`, `instance_id`, `workload`, prefix/messages hashing policy)
- [ ] Document tier map to our `EvalTier` and frozen catalog model IDs used for `verified_target_model_id`

### Step 2: Converter CLI

- [ ] Add `scripts/eval/ingest-twinrouterbench-corpus.ts` (npm script optional) that reads upstream jsonl (or a tiny checked-in sample) and writes our static-track JSON
- [ ] Skip/drop unmappable rows; never invent verified tiers or scores
- [ ] Support `--limit N` for CI-sized output; fail clearly on schema mismatch
- [ ] Unit tests: at least one synthetic upstream row → valid static-track document loadable by `loadTwinRouterBenchStaticTrack`

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` — pin, license, tier map *(also in File Scope)*

**Check If Affected:**
- `README.md` — full operator corpus docs land in SP-188

## Completion Criteria

- [ ] Upstream pin + license documented
- [ ] Converter produces adapter-valid static-track JSON
- [ ] Tier map explicit; no invented labels
- [ ] Full ~970-row corpus not checked in yet
- [ ] Release-gate thresholds untouched

## Git Commit Convention

- `feat(SP-186): description`

## Do NOT

- Vendor full corpus or change absolute gate thresholds
- Implement SP-187 subset check-in or SP-188 CI wiring
- Modify `router-pipeline.ts` or the pi extension
- Bump npm version
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, or `.gitnexus/`

---

## Amendments (Added During Execution)

(none yet)
