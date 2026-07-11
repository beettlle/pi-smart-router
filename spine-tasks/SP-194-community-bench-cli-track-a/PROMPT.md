# Task: SP-194 — Community Bench CLI Track A

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Ship privacy-safe community-bench CLI with setup fingerprint, TwinRouterBench Track A gates, and JSON + email .txt reports.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#105
- Bucket: feature
- Partial: #105 (Track A + reports; Track B/C + contribute docs in SP-195)
- Release: v0.9.3

## Mission

Partial #105 — Ship a user-runnable `npm run routing:community-bench` CLI that (1) builds a **privacy-safe setup fingerprint** (package version, OS/arch/Node, hardware class, **hashed** fleet `provider/id` list + tier counts, `% capability_source === benchmark` vs `pattern_default`, encoder/hydra mode if readable, corpus pin ids), (2) runs **Track A (required):** TwinRouterBench pinned corpus + `config/release-gates.json` absolute/baseline asserts via existing harness / `assert-release-gates` helpers — report pass/fail; do **not** change thresholds, (3) writes `community-bench-report.json` (`--output`) + email-ready `community-bench-report.txt` (`--email-file` / `--no-email-file`) with `Subject:` line, privacy blurb, fingerprint, pins, per-track metrics, PASS/FAIL, footer. Support `--print-issue-body`; optional `--mailto` (`.txt` remains source of truth). No upload server and no SMTP auto-send. Do **not** implement Track B dogfood adapter (#95) or Track C LLMRouterBench (SP-195); do **not** change gate thresholds.

## Dependencies

- **None** (Track A uses landed #101 TwinRouterBench corpus path)

## Context to Read First

- `scripts/eval/assert-release-gates.ts`
- `scripts/eval/run-harness.ts`
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md`
- `config/release-gates.json` — read-only thresholds
- `config/benchmark-profiles.json` — fingerprint only (do not re-run live ingest)
- `package.json` — `routing:eval-harness:corpus-smoke`, `routing:assert-release-gates:corpus-report`
- GitHub #105 acceptance (fingerprint + Track A + artifacts)

## Environment

- **Workspace:** `scripts/eval/`, `package.json`, `tests/unit/`
- **Services required:** None (offline on vendored TwinRouterBench subset)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/community-bench.ts`, `tests/unit/community-bench.test.ts` |
| May change | `package.json`, `scripts/eval/community-bench-report.ts`, `scripts/eval/community-bench-fingerprint.ts` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**`, `README.md` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/community-bench.test.ts` |
| fileScopeMustChange | `scripts/eval/community-bench.ts`, `tests/unit/community-bench.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Offline CLI writes JSON + email .txt on TwinRouterBench corpus; fingerprint hashes fleet ids; email has Subject: + PASS/FAIL and no prompt/API-key fields; gate embedding matches assert-release-gates; thresholds unchanged. |

## Steps

### Step 1: Fingerprint + report schema

- [ ] Implement privacy-safe fingerprint helpers (stable fleet hash; no raw prompts/API keys)
- [ ] Define report JSON schema + email `.txt` formatter (`Subject:`, privacy blurb, fingerprint, pins, Track A metrics, PASS/FAIL, footer with maintainer contact constant)
- [ ] Unit tests: schema shape; stable hash; formatter has Subject + PASS/FAIL; no prompt/API-key fields

### Step 2: Track A CLI wiring

- [ ] Add `scripts/eval/community-bench.ts` + `npm run routing:community-bench`
- [ ] Track A: run corpus harness / assert-release-gates helpers on `tests/eval/corpus/twinrouterbench` (or equivalent documented path); embed pass/fail without editing thresholds
- [ ] Flags: `--output`, `--email-file` / `--no-email-file`, `--print-issue-body`, optional `--mailto`
- [ ] Offline smoke path documented in script `--help`

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run routing:community-bench` offline smoke (writes both artifacts under `/tmp` or test cwd)
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- (none this task — README contribute section is SP-195)

**Check If Affected:**
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` — cross-link only if needed
- `README.md` — leave contribute section for SP-195

## Completion Criteria

- [ ] Offline Track A CLI + JSON + email .txt
- [ ] Fingerprint privacy-safe
- [ ] Gate embedding matches assert-release-gates
- [ ] Thresholds unchanged
- [ ] No SMTP / upload server
- [ ] Contract + suite green

## Git Commit Convention

- `feat(SP-194): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Implement Track B (#95 dogfood export) beyond a stub skip (prefer leave for SP-195)
- Implement Track C LLMRouterBench flags (SP-195)
- Change `config/release-gates.json` absolute thresholds
- Auto-send email or upload reports
- Re-run live leaderboard ingest (#100)

## Amendments

None.
