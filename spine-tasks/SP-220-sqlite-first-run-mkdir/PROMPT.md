# Task: SP-220 — SQLite first-run parent mkdir

**Created:** 2026-08-20
**Size:** S

## Review Level: 1

**Assessment:** Missing `.pi-smart-router` parent dir is first-run, not corrupt-DB; mkdir + quiet open.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#130
- Bucket: bug
- Closes: #130
- Release: v0.16.1
- Manifest: `spine-tasks/_authoring/release-v0.16.1/manifest.md`

## Mission

Closes #130 — Opening the default file store when the parent directory is missing must **create** the directory (recursive `mkdir`) and return a non-degraded `SqliteStore`. Missing-directory / ENOENT first-run must **not** be logged as corrupt-DB recovery and must not dump a TypeError stack. True corrupt-file recovery (rename + recreate) and unwritable-dir MemoryStore fallback must still work.

## Dependencies

- None (disjoint from PR #128 mapper / PR #129 extension limits)

## Context to Read First

- GitHub #130 body (acceptance criteria)
- `src/infrastructure/persistence/sqlite-store.ts` — `createResilientStore`, `SqliteStore` constructor
- `tests/unit/sqlite-store-fallback.test.ts` — existing corrupt / unwritable cases
- `.pi/extensions/smart-router/utils.ts` — `DEFAULT_ROUTER_STATE_DB_PATH` / `createExtensionStore`
- Manifest: `spine-tasks/_authoring/release-v0.16.1/manifest.md`

## Environment

- **Workspace:** `src/infrastructure/persistence/`, `tests/unit/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/persistence/sqlite-store.ts`, `tests/unit/sqlite-store-fallback.test.ts` |
| May change | `.pi/extensions/smart-router/utils.ts` (only if mkdir belongs at path helper — prefer store) |
| Must NOT change | `src/domain/**`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts`, `src/config/defaults.ts`, `config/release-gates.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/sqlite-store-fallback.test.ts` |
| fileScopeMustChange | `src/infrastructure/persistence/sqlite-store.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Missing parent dir → mkdir + SqliteStore degraded=false; no corrupt-DB warning for ENOENT; corrupt + unwritable paths still correct; unit test covers missing parent; #130 closable |

## Steps

### Step 1: Ensure parent dir before open

- [ ] In `SqliteStore` constructor and/or `createResilientStore`, ensure parent of `dbPath` exists via recursive `mkdir` (skip for `:memory:`)
- [ ] Classify missing-parent / ENOENT first-run so it is **not** logged as corrupt-DB recovery
- [ ] Preserve corrupt rename+recreate and unwritable MemoryStore fallback

**Plan-review checkpoint** — First-run path vs corrupt path branched; no silent MemoryStore on missing parent.

### Step 2: Testing & Verification

- [ ] Add unit test: nested path under `mkdtemp`, parent absent → `degraded === false`, SQLite file created, no `corrupt-DB recovery` warning
- [ ] Confirm existing `sqlite-store-fallback.test.ts` cases remain green
- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% when application code changed

## Documentation Requirements

**Must Update:** none (behavior fix)

**Check If Affected:**
- `README.md` — only if first-run store docs mention MemoryStore fallback incorrectly

## Completion Criteria

- [ ] Missing parent → mkdir + non-degraded SqliteStore
- [ ] No corrupt-DB recovery warning / TypeError dump for first-run ENOENT
- [ ] Corrupt + unwritable regression tests green
- [ ] Unit test for missing parent under temp root
- [ ] #130 closable

## Commit

- `fix(SP-220): mkdir sqlite parent on first-run (#130)`

## Git Commit Convention

- `fix(SP-220): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Change `DEFAULT_ROUTER_STATE_DB_PATH` / `ROUTER_STATE_DB_PATH` contract
- Treat missing parent as corrupt-DB recovery or fall back to MemoryStore for that case
- Touch `src/domain/pipeline/router-pipeline.ts` or `.pi/extensions/smart-router/index.ts`
- Flip encoder defaults / release gates

## Amendments

None.
