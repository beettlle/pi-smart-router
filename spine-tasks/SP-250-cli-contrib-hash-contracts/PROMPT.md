# Task: SP-250 — CLI dedupe + contrib export contract tests

**Created:** 2026-09-02
**Size:** S

## Review Level: 1

**Assessment:** Point CLI contrib hash at shared HMAC helper; schema version bump if format changes; contract tests for export JSONL.
**Score:** 4/8 — Blast radius: 2 (CLI + export contracts), Pattern novelty: 0, Security: 2, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#146
- Bucket: feature
- Closes: #146
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Mission

Closes #146 — finish **CLI + contract** half after SP-249:

1. Replace duplicate unsalted `hashSessionIdForContribExport` in `src/cli/smart-router-cli.ts` with the shared HMAC helper from SP-249 (single module).
2. If hash format changes vs prior unsalted hex, bump contrib export schema/version field as the repo already versions exports.
3. Contract tests: export JSONL contains no raw `session_id`; hashed form stable per install/cwd; pepper fields stripped.
4. Do **not** write the operator migration README note (SP-253) — leave a one-line STATUS discovery pointing at the version bump for docs.

## Dependencies

- **Task:** SP-249 (HMAC helper must exist)

## Context to Read First

- Issue #146 — CLI dedupe + migration note
- `Parent split: SP-249 — infra HMAC hash`
- SP-249 PROMPT + exported helper path
- `src/cli/smart-router-cli.ts` — `hashSessionIdForContribExport`
- `tests/unit/smart-router-cli.test.ts`, `tests/unit/telemetry-export.test.ts`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/cli/smart-router-cli.ts` |
| May change | contrib export schema/version paths under `src/**`, `tests/unit/smart-router-cli.test.ts`, `tests/unit/telemetry-export.test.ts`, `tests/unit/**` (adjacent) |
| Must NOT change | `src/infra/telemetry.ts` (owned by SP-249 unless import-only), `README.md` (SP-253), `package.json` (version) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-cli.test.ts tests/unit/telemetry-export.test.ts` |
| fileScopeMustChange | `src/cli/smart-router-cli.ts` |
| fileScopeMustNotChange | `README.md`, `package.json` |
| completionCriteria | CLI uses shared HMAC helper; export contracts assert no raw session_id; schema version bumped if hash format changed; #146 closable |

## Steps

### Step 0: Preflight

- [ ] Import SP-249 helper; locate CLI duplicate hash sites

### Step 1: CLI dedupe + schema version

- [ ] Point CLI at shared helper; remove unsalted duplicate
- [ ] Bump export schema/version if hash format changed

### Step 2: Testing & Verification

- [ ] Contract tests for JSONL / contrib rows
- [ ] Contract `testCommand` green
- [ ] #146 closable with SP-249

## Completion Criteria

- [ ] CLI + contracts complete; #146 closable

## Do NOT

- Reintroduce unsalted SHA-256 for contrib exports
- Edit README migration prose (SP-253)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-250): CLI HMAC session hashes + export contracts (#146)`

## Amendments

- None
