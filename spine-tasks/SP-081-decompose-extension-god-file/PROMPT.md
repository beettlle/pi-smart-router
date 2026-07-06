# Task: SP-081 — Decompose pi extension god file

**Created:** 2026-07-05
**Size:** L

## Mission
Refactor and decompose the pi extension god file (currently ~1,643 lines) into smaller, manageable modules to improve maintainability.

## Dependencies
- SP-080

## Context to Read First
- `.pi/extensions/smart-router/index.ts` — god file

## File Scope
| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts` |

## Contract
| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Extension god file is decomposed. |

## Steps
### Step 1: Decomposition
- [ ] Identify logical modules
- [ ] Move code to modules

## Testing
- [ ] Run full test suite to ensure no regressions

## Completion Criteria
- [ ] All steps complete
- [ ] Tests pass

## Do NOT
- Change behavior during refactor

---
