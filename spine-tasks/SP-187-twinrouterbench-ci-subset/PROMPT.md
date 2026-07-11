# Task: SP-187 — TwinRouterBench CI-Sized Corpus Subset

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Vendor a bounded, checksummed static-track subset for offline harness smoke without bloating PR CI.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#101
- Bucket: feature
- Partial: #101 (subset vendor; gates/docs in SP-188)
- Release: v0.9.1

## Mission

Partial #101 — Using SP-186’s converter and pin, vendor a **CI-sized** TwinRouterBench static-track subset under `tests/eval/corpus/twinrouterbench/` (not under `tests/eval/fixtures/` — keep default release-gate fixture aggregates stable). Document subset size bound, checksum(s), and how to regenerate from the pinned upstream source. Keep the two sample fixtures under `tests/eval/fixtures/twinrouterbench/` unchanged. Full corpus remains optional for local runs via the converter + `--limit` / no-limit.

## Dependencies

- **Task:** SP-186 (pin + converter must exist)

## Context to Read First

- `spine-tasks/SP-186-twinrouterbench-pin-convert/PROMPT.md`
- `scripts/eval/ingest-twinrouterbench-corpus.ts`
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md`
- `scripts/eval/run-harness.ts` — recursive JSON load behavior
- GitHub #101 (vendor CI subset)

## Environment

- **Workspace:** `tests/eval/corpus/`, `scripts/eval/`
- **Services required:** None (offline from pin/converter; network only if regenerating from upstream during authoring)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/eval/corpus/twinrouterbench/**`, `tests/eval/corpus/twinrouterbench/PROVENANCE.md` |
| May change | `scripts/eval/ingest-twinrouterbench-corpus.ts`, `tests/unit/ingest-twinrouterbench-corpus.test.ts`, `package.json` |
| Must NOT change | `config/release-gates.json`, `tests/eval/fixtures/twinrouterbench/*.json`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-twinrouterbench-corpus.test.ts tests/eval/twinrouterbench-adapter.test.ts` |
| fileScopeMustChange | `tests/eval/corpus/twinrouterbench/**` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Bounded subset checked in with checksum + size documented; harness loads subset via --fixtures path; sample fixtures untouched; no absolute gate threshold edits. |

## Steps

### Step 1: Generate and vendor subset

- [ ] Produce CI-sized subset (document exact max record/file count — prefer ≤50 records / small MB) into `tests/eval/corpus/twinrouterbench/`
- [ ] Prefer code/tool workloads (SWE-bench / BFCL / terminal-like) when selecting rows; skip chat-only if present
- [ ] Record SHA-256 (or equivalent) checksums and regeneration command in PROVENANCE.md
- [ ] Ensure each vendored JSON validates via `loadTwinRouterBenchStaticTrack` / harness load

### Step 2: Offline unit coverage

- [ ] Unit/integration test: corpus directory loads and scores without network
- [ ] Assert documented size bound (fail if subset exceeds bound)
- [ ] Confirm `tests/eval/fixtures/twinrouterbench/` sample files still pass existing adapter tests

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run routing:eval-harness -- --fixtures tests/eval/corpus/twinrouterbench --summary-only` (or documented equivalent)
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` — subset size, checksums, regenerate steps *(also in File Scope)*

**Check If Affected:**
- `README.md` — operator wiring in SP-188

## Completion Criteria

- [ ] Bounded corpus subset vendored offline
- [ ] Checksums + regenerate docs present
- [ ] Sample fixtures unchanged
- [ ] Default `tests/eval/fixtures` tree not polluted with full corpus
- [ ] Gate thresholds untouched

## Git Commit Convention

- `feat(SP-187): description`

## Do NOT

- Check in full ~970-row corpus
- Change absolute gate thresholds
- Wire CI/assert-release-gates (SP-188)
- Modify `router-pipeline.ts` or bump npm version
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, or `.gitnexus/`

---

## Amendments (Added During Execution)

(none yet)
