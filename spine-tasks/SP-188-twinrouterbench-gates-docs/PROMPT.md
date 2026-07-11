# Task: SP-188 — TwinRouterBench Corpus Gates + Docs

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Wire corpus subset into harness/CI smoke and document #95 public-track path without changing absolute gate thresholds.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#101
- Bucket: feature
- Closes: #101
- Release: v0.9.1

## Mission

Closes #101 — Wire the SP-187 vendored TwinRouterBench corpus subset into eval harness CI smoke and assert-release-gates **via an explicit corpus path** (do not silently change default `tests/eval/fixtures` absolute-gate aggregates). Document operator commands, subset bounds, and how #95 can use the public static-track gate alongside live dogfood traces. **Do not** change absolute thresholds in `config/release-gates.json` without operator review — if corpus metrics would fail current thresholds, keep corpus assertions as a separate smoke/report path and document the gap for #95.

## Dependencies

- **Task:** SP-187 (CI subset must exist)

## Context to Read First

- `spine-tasks/SP-187-twinrouterbench-ci-subset/PROMPT.md`
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md`
- `scripts/eval/assert-release-gates.ts`
- `scripts/eval/run-harness.ts`
- `.github/workflows/eval-harness-smoke.yml`
- `package.json` — `release:functional-smoke`, `routing:eval-harness*`
- `README.md` — eval harness section
- GitHub #101 verification checklist; soft feed for #95

## Environment

- **Workspace:** `scripts/eval/`, `.github/workflows/`, `README.md`, `package.json`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/eval-harness-smoke.yml`, `README.md` |
| May change | `package.json`, `scripts/eval/assert-release-gates.ts`, `tests/eval/assert-release-gates.test.ts`, `scripts/eval/run-harness.ts` |
| Must NOT change | `config/release-gates.json` absolute gate numbers, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/eval/assert-release-gates.test.ts tests/eval/twinrouterbench-adapter.test.ts` |
| fileScopeMustChange | `.github/workflows/eval-harness-smoke.yml`, `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | CI smoke runs corpus subset offline and stays bounded; assert-release-gates or npm script documents corpus path; README covers pin/subset/#95 feed; absolute thresholds unchanged; `npm run verify:ci` green. |

## Steps

### Step 1: Wire harness CI + npm scripts

- [ ] Add npm script(s) for corpus harness smoke (explicit `--fixtures tests/eval/corpus/twinrouterbench`)
- [ ] Extend `.github/workflows/eval-harness-smoke.yml` to run corpus smoke (still no network; timeout stays tight)
- [ ] Keep existing default-fixture smoke green and bounded

### Step 2: assert-release-gates + #95 docs

- [ ] Support corpus path in assert-release-gates CLI and/or a dedicated npm script without editing absolute threshold values
- [ ] README: document pin, subset location, regenerate, CI bounds, and that #95 public static-track AC can use this corpus path
- [ ] Optional RouterBench classic smoke is out of scope unless trivial; prefer document-as-deferred

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run corpus harness smoke script
- [ ] Run `npm run release:functional-smoke` (or document why corpus is separate) — must not regress default fixture gates
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `README.md` — TwinRouterBench corpus pin, subset path, CI smoke, #95 feed *(also in File Scope)*

**Check If Affected:**
- `docs/routing-roadmap.md` — only if §5 offline eval wording is stale
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` — cross-link if needed

## Completion Criteria

- [ ] Corpus smoke in CI (offline, bounded)
- [ ] Operator docs for pin/subset/regenerate
- [ ] #95 public-track path documented
- [ ] Absolute gate thresholds unchanged
- [ ] `npm run verify:ci` green
- [ ] Issue #101 closable

## Git Commit Convention

- `feat(SP-188): description`

## Do NOT

- Change absolute numbers in `config/release-gates.json` without operator approval
- Implement #102 label packs or #103 LLMRouterBench
- Implement #95 dogfood protocol itself
- Modify `router-pipeline.ts` or bump npm version
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, or `.gitnexus/`

---

## Amendments (Added During Execution)

### Amendment 1 — 2026-07-10 18:41

**Issue:** Preflight pre-landed risk — `package.json` already changed on main (SP-186 added `routing:ingest-twinrouterbench`).
**Resolution:** Drop `package.json` from `fileScopeMustChange`; keep as May change for corpus smoke script. Contract proof is workflow + README edits.
