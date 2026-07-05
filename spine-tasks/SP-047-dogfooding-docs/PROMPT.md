# Task: SP-047 — Dogfooding Docs

**Created:** 2026-07-04
**Size:** S

## Review Level: 0

**Assessment:** Document pi extension dogfooding workflow and operator env vars in README.
**Score:** 1/8

## Source

- GitHub: beettlle/pi-smart-router#13
- Bucket: documentation

## Mission

README should document the pi extension dogfooding path and operator environment variables.

Include:
- Install/bootstrap from repo root (`npm install`, trust, `/login`, scoped models)
- `/model smart-router/auto`, `/smart-router status`, `/smart-router history`
- Env vars:
  - `SMART_ROUTER_LOG_ROUTING=1` — debug routing decisions to stderr
  - `SMART_ROUTER_DATASET=1` — (future, #8) opt-in dataset capture
  - `ROUTER_STATE_DB_PATH` — override SQLite location

Optionally update `specs/001-build-smart-router/quickstart.md` if it duplicates README content.

## Dependencies

- SP-046

## Context to Read First

- `README.md`
- `specs/001-build-smart-router/quickstart.md`
- `.pi/extensions/smart-router/index.ts` — command names and env var usage

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `specs/001-build-smart-router/quickstart.md` |
| Must NOT change | `src/**`, `.pi/extensions/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/**` |
| completionCriteria | README documents dogfooding install path, slash commands, and operator env vars; claims match extension behavior. |

## Steps

### Step 1: README dogfooding section

- [ ] Add install/bootstrap steps from repo root
- [ ] Document `/model smart-router/auto`, `/smart-router status`, `/smart-router history`
- [ ] Document `SMART_ROUTER_LOG_ROUTING`, `SMART_ROUTER_DATASET` (future), `ROUTER_STATE_DB_PATH`

### Step 2: Quickstart alignment (if needed)

- [ ] Cross-check `specs/001-build-smart-router/quickstart.md`; update or link to README to avoid drift

### Step 3: Testing and verification

- [ ] Verify documented commands and env vars exist in extension code
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] README dogfooding section is accurate and complete

## Git Commit Convention

- `docs(SP-047): description`

## Do NOT

- Change application code
- Document unimplemented dataset features as available (mark #8 as future)

---

## Amendments (Added During Execution)
