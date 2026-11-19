# Task: SP-328 — Operator docs: Sprint 2 consumer table + #188 enablement

**Created:** 2026-11-19
**Size:** S

## Review Level: 0

**Assessment:** Document typed-judgment Sprint 2 consumers (#188) and remaining #183 children without flipping defaults.
**Score:** 1/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#183
- Release: v1.5.0
- Bucket: documentation
- Partial: #183 (docs; leave epic open for #189/#190/#191)

## Mission

Update operator docs after SP-326/SP-327 land:

1. README typed-judgment section: Sprint 2 consumer table (tier hints, local_zero gates landed; HyDRA source / adaptive reasoning / eval still open).
2. Document enablement knobs / reason codes added by #188 (no default flips).
3. Sync `docs/routing-roadmap.md` / migration notes if stage consumer behavior changed.
4. Note #182 close path via #179+#181 in release notes only if those issues closed on main — do not invent closure.

## Dependencies

- SP-326
- SP-327

## Context to Read First

- Issue #183 children table; #188 AC
- Existing README typed judgment section (SP-309)
- `docs/routing-roadmap.md`, `docs/migration-v1.md`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md`, `docs/routing-roadmap.md` |
| May change | `docs/migration-v1.md`, `docs/qa/**` (cross-links only) |
| Must NOT change | `src/`, `.pi/`, `tests/`, `package.json`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `README.md`, `docs/routing-roadmap.md` |
| fileScopeMustNotChange | `src/`, `.pi/`, `tests/`, `package.json`, `.review/` |
| completionCriteria | README documents #188 consumers + remaining Sprint 2; roadmap row updated; no default-flip claims |

## Steps

### Step 0: Preflight

- [ ] Diff SP-326/SP-327 landed knobs/reason codes on main

### Step 1: Docs

- [ ] README consumer table + enablement
- [ ] Roadmap / migration sync

### Step 2: Testing & Verification

- [ ] `rg` for new reason codes / section anchors in README
- [ ] Confirm no claim that #183 is fully closed
- [ ] Run Contract `testCommand` (`true`)

## Do NOT

- Change runtime defaults
- Close #183 in docs as complete

## Completion Criteria

- [ ] Partial #183 docs AC for #188 consumers met
- [ ] Contract green

## Git Commit Convention

`docs(SP-328): typed-judgment Sprint 2 consumer docs (#183)`
