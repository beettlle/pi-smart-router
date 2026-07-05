# Task: SP-068 — Gitignore Spine Entry

**Created:** 2026-07-05
**Size:** S

## Review Level: 0

**Assessment:** Add missing `.pi/` gitignore entry so spine doctor gitignore check passes.
**Score:** 1/8

## Source

- GitHub: beettlle/pi-smart-router#28
- Bucket: bug

## Mission

`spine doctor` warns: `.gitignore has spine runtime entries (missing 1 entry)`.

Current `.gitignore` uses `.pi/*` with exceptions for extensions, but pi-spine expects the exact entry `.pi/` in `SPINE_GITIGNORE_ENTRIES`. The doctor check does exact line matching, not semantic equivalence.

Fix:
- Add `.pi/` to `.gitignore` alongside existing `.pi/*` / `!.pi/extensions/**` rules
- Preserve tracking of `.pi/extensions/smart-router/` under git
- Optionally run `spine init` to merge missing entries without overwriting extension tracking rules

## Dependencies

- SP-067

## Context to Read First

- `.gitignore` — current pi entries
- `spine doctor` output for gitignore check

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.gitignore` |
| Must NOT change | `.pi/extensions/**`, `src/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.gitignore` |
| fileScopeMustNotChange | `src/**` |
| completionCriteria | `spine doctor` gitignore check passes; `.pi/agent` ignored; `.pi/extensions/` still tracked. |

## Steps

### Step 1: Add .pi/ entry

- [ ] Add `.pi/` line to `.gitignore` without breaking `!.pi/extensions/**` rules

### Step 2: Verify ignore semantics

- [ ] Run `spine doctor` — gitignore check passes
- [ ] Run `git check-ignore -v .pi/agent` — ignored
- [ ] Run `git ls-files .pi/extensions/` — extension still tracked

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] `spine doctor` gitignore check green
- [ ] Extension files remain tracked
- [ ] No unrelated changes

## Git Commit Convention

- `fix(SP-068): description`

## Do NOT

- Remove or weaken `!.pi/extensions/**` unignore rules
- Untrack `.pi/extensions/smart-router/`

---

## Amendments (Added During Execution)
