# Task: SP-200 — TwinRouterBench Full Static-Track Path + Nightly

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Documented full ~970 convert + report-only path; optional nightly GHA; README #95 dual-gate links.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#107
- Bucket: feature
- Closes: #107
- Release: v0.10.0

## Mission

Closes #107 — After SP-199’s 150-row CI subset, ship a **first-class local/full static-track path** (pin fetch → ingest without `--limit` → harness/gates `--report-only`) **without** checking full JSON into git, plus an **optional** scheduled nightly job that must not block PR CI. Keep `release:functional-smoke` on default fixtures. Cross-link README to #95 dual-gate protocol (live dogfood + public static-track). Absolute `config/release-gates.json` thresholds remain operator-owned.

## Dependencies

- **Task:** SP-199 (150-row subset + PROVENANCE baseline)
- **Task:** SP-196 (README #95 protocol link exists)

## Context to Read First

- `tests/eval/corpus/twinrouterbench/PROVENANCE.md`
- `package.json` — `routing:ingest-twinrouterbench`, corpus-smoke / corpus-report scripts
- `.github/workflows/eval-harness-smoke.yml`
- `docs/qa/shadow-dogfood-protocol.md`
- `spine-tasks/SP-188-twinrouterbench-gates-docs/PROMPT.md`
- GitHub #107 verification

## Environment

- **Workspace:** `package.json`, `.github/workflows/`, `README.md`, `tests/eval/corpus/twinrouterbench/`
- **Services required:** None for PR path; nightly may use network for pin download

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md`, `package.json`, `.github/workflows/twinrouterbench-full-nightly.yml` |
| May change | `tests/eval/corpus/twinrouterbench/PROVENANCE.md`, `.github/workflows/eval-harness-smoke.yml`, `scripts/eval/**` |
| Must NOT change | `config/release-gates.json`, `tests/eval/corpus/twinrouterbench/ci-subset.json`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-twinrouterbench-corpus.test.ts tests/eval/assert-release-gates.test.ts` |
| fileScopeMustChange | `README.md`, `.github/workflows/twinrouterbench-full-nightly.yml` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Full-track local npm path documented; optional nightly non-blocking; PR corpus smoke still bounded; #107 closable. |

## Steps

### Step 1: Full-track npm scripts + docs

- [ ] Add npm script(s) for full convert (no `--limit`) + report-only harness/gates — outputs must be gitignored / under local cache path
- [ ] PROVENANCE + README: document pin fetch → convert → report-only; explicitly “do not check in full JSON”
- [ ] Confirm PR `routing:eval-harness:corpus-smoke` still uses vendored ≤150 subset

### Step 2: Optional nightly workflow

- [ ] Add `.github/workflows/twinrouterbench-full-nightly.yml` on `schedule` (and maybe `workflow_dispatch`)
- [ ] Job downloads pinned bank, converts full track, runs report-only — **not** required on PR
- [ ] Failures must not gate PR CI / release:functional-smoke

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run routing:eval-harness:corpus-smoke`
- [ ] Run `npm run release:functional-smoke` — default fixtures still absolute
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] Comment + close #107

## Documentation Requirements

**Must Update:**
- `README.md` — full-track local/nightly + #95 dual-gate *(also in File Scope)*

**Check If Affected:**
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md`
- `docs/qa/shadow-dogfood-protocol.md`

## Completion Criteria

- [ ] Full-track local path documented + scripted
- [ ] Optional nightly does not block PR
- [ ] Absolute gates / functional-smoke unchanged
- [ ] #107 closable

## Git Commit Convention

- `feat(SP-200): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Vendor full ~970-row corpus in git
- Change absolute release-gate thresholds
- Point `release:functional-smoke` at corpus
- Regenerate `ci-subset.json` (SP-199 owns)

## Amendments

None.
