# Task: SP-080 — Deprioritize Gemini when tool-call history exists

**Created:** 2026-07-05
**Size:** M

## Mission
Deprioritize Google/Gemini models when the session has tool-call history to improve model selection based on capability.

## Dependencies
- SP-079

## Context to Read First
- `src/domain/pipeline/router-pipeline.ts` — model selection

## File Scope
| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |

## Contract
| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Gemini model priority reduced if tool-call history exists. |

## Steps
### Step 1: Update model selection logic
- [ ] Check session for tool-call history
- [ ] Update priority logic

## Testing
- [ ] Add unit test case

## Completion Criteria
- [ ] All steps complete
- [ ] Tests pass

## Do NOT
- Impact other model selection logic

---
