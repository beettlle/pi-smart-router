# Task: SP-197 — Routing Roadmap Status Sync

**Created:** 2026-07-11
**Size:** S

## Review Level: 0

**Assessment:** Docs-only status truth for `docs/routing-roadmap.md` after v0.9.3 lands.
**Score:** 1/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#109
- Bucket: documentation
- Closes: #109
- Release: v0.10.0

## Mission

Closes #109 — Refresh `docs/routing-roadmap.md` §2 status cells and header “as of” date so landed work (#71–#84 era follow-ons, #102/#103/#105, TwinRouterBench soft-feed, community bench) reads Landed or Partial-remaining with one-line evidence. Point Phase 5 / shadow deploy at #95 + `docs/qa/shadow-dogfood-protocol.md`. Cite #96 as enablement tracker (not build-from-scratch). Do **not** invent new backlog rows or reorder priorities beyond status truth.

## Dependencies

- **None** (soft: SP-196 protocol path should exist on main before or in same release)

## Context to Read First

- `docs/routing-roadmap.md`
- `spine-tasks/_authoring/issues/issue-NEW-roadmap-sync.md`
- `spine-tasks/_authoring/backlog-snapshot-20260711-v0100.md`
- Closed issues #102, #103, #105; open #95, #96, #108
- GitHub #109

## Environment

- **Workspace:** `docs/routing-roadmap.md`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `docs/routing-roadmap.md` |
| May change | None |
| Must NOT change | `src/**`, `config/release-gates.json`, `README.md` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `docs/routing-roadmap.md` |
| fileScopeMustNotChange | `src/**`, `config/release-gates.json` |
| completionCriteria | Status column + as-of date accurate; #95/#96 pointers present; no new invented backlog rows; #109 closable. |

## Steps

### Step 1: Sync status column

- [ ] Update §2 landed / Partial-remaining cells with evidence (code path or closed issue)
- [ ] Reflect #102 / #103 / #105 closed where true
- [ ] Phase 5 / shadow: pointer to #95 + `docs/qa/shadow-dogfood-protocol.md`
- [ ] #96 cited as enablement tracker; #108 for profile coverage follow-on if §2 still implies #75 open
- [ ] Fix header / “as of” date to edit date

### Step 2: Testing & Verification

- [ ] Read-through: no contradiction with closed issue list
- [ ] Run `npm run typecheck && npm test` (docs-only sanity)
- [ ] Comment + close #109 when AC met

## Documentation Requirements

**Must Update:**
- `docs/routing-roadmap.md` *(also in File Scope)*

**Check If Affected:**
- `README.md` — do not edit (SP-196/SP-200 own README)

## Completion Criteria

- [ ] Status truth updated
- [ ] #95/#96 pointers present
- [ ] No invented backlog rows
- [ ] #109 closable

## Git Commit Convention

- `docs(SP-197): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Edit `README.md` or `src/**`
- Change release gates or implement features
- Reopen #75

## Amendments

None.
