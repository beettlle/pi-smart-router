# Task: SP-278 — pipeline tests fragment finish 155

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Finish test fragmentation and retire monolithic router-pipeline.test.ts.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#155
- Bucket: feature
- Closes: #155
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Closes #155 — finish fragmenting remaining suites; delete monolith or leave thin re-export only if required by tooling.

## Dependencies

- **SP-277**
- **SP-274**

## Context to Read First

- SP-277
- Issue #155
- SP-274 stage layout

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/` |
| May change | `vitest.config.ts` |
| Must NOT change | `src/ domain policy changes`, `package.json version` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm test` |
| fileScopeMustChange | `tests/unit/` |
| fileScopeMustNotChange | `package.json version field` |
| completionCriteria | Monolith retired or thin re-export; Closes #155; npm test green |

## Steps

### Step 0: Preflight

- [ ] List remaining monolith suites

### Step 1: Finish fragmentation

- [ ] Move remaining suites
- [ ] Delete or thin re-export monolith

### Step 2: Testing & Verification

- [ ] Contract testCommand green

## Completion Criteria

- [ ] Monolith retired or thin re-export; Closes #155; npm test green

## Do NOT

- Production behavior changes
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `test(SP-278): finish pipeline test fragmentation (#155)`
