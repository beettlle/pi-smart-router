# Task: SP-199 — TwinRouterBench CI Subset 150

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Raise vendored TwinRouterBench CI subset 50→150 code/tool rows; update checksums/tests.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#107
- Bucket: feature
- Partial: #107
- Release: v0.10.0

## Mission

Partial #107 — Raise `CI_SUBSET_MAX_RECORDS` from **50 → 150** in `scripts/eval/ingest-twinrouterbench-corpus.ts`, regenerate `tests/eval/corpus/twinrouterbench/ci-subset.json` with `--prefer-code-tool --limit 150`, update SHA-256 and docs in `PROVENANCE.md`, and align unit tests. Keep `release:functional-smoke` on default fixtures; do **not** vendor the full ~970-row corpus; do **not** change absolute `config/release-gates.json` thresholds.

## Dependencies

- **None**

## Context to Read First

- `scripts/eval/ingest-twinrouterbench-corpus.ts`
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md`
- `tests/unit/ingest-twinrouterbench-corpus.test.ts`
- `spine-tasks/SP-187-twinrouterbench-ci-subset/PROMPT.md`
- GitHub #107

## Environment

- **Workspace:** `scripts/eval/`, `tests/eval/corpus/twinrouterbench/`
- **Services required:** None for verify; network only if regenerating from pinned upstream during authoring

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/ingest-twinrouterbench-corpus.ts`, `tests/eval/corpus/twinrouterbench/ci-subset.json`, `tests/eval/corpus/twinrouterbench/PROVENANCE.md`, `tests/unit/ingest-twinrouterbench-corpus.test.ts` |
| May change | `tests/eval/corpus/twinrouterbench/**`, `package.json` |
| Must NOT change | `config/release-gates.json`, `tests/eval/fixtures/twinrouterbench/*.json`, `src/domain/pipeline/router-pipeline.ts`, `.github/workflows/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-twinrouterbench-corpus.test.ts tests/eval/twinrouterbench-adapter.test.ts` |
| fileScopeMustChange | `tests/eval/corpus/twinrouterbench/ci-subset.json`, `scripts/eval/ingest-twinrouterbench-corpus.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Vendored subset ≤150 with checksum; tests assert bound 150; fixtures untouched; gates unchanged. |

## Steps

### Step 1: Bump bound + regenerate subset

- [ ] Set `CI_SUBSET_MAX_RECORDS = 150`
- [ ] Regenerate `ci-subset.json` with prefer-code-tool limit 150 (from pin / documented input)
- [ ] Update PROVENANCE checksums + regenerate commands (limit 150)
- [ ] Update unit tests expecting 50 → 150

### Step 2: Offline load sanity

- [ ] Confirm corpus still loads offline via harness fixtures path
- [ ] Confirm sample fixtures under `tests/eval/fixtures/twinrouterbench/` unchanged

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run routing:eval-harness:corpus-smoke` (or equivalent)
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` *(also in File Scope)*

**Check If Affected:**
- `README.md` — full-track / nightly docs owned by SP-200

## Completion Criteria

- [ ] Bound 150 + regenerated subset + checksum
- [ ] Tests updated
- [ ] Full corpus not checked in
- [ ] Absolute gates untouched
- [ ] #107 remains Partial until SP-200

## Git Commit Convention

- `feat(SP-199): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Check in full ~970-row corpus
- Change absolute release-gate thresholds
- Point `release:functional-smoke` at corpus
- Edit `.github/workflows/**` (SP-200)

## Amendments

None.
