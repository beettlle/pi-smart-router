# Task: SP-078 — Fix Gemini Thought Signature 400 Handling

**Created:** 2026-07-05
**Size:** S

## Mission
Stop treating Gemini thought_signature 400s as infrastructure failovers. Handle them as client/protocol errors instead to improve error clarity and reduce unnecessary retries on invalid requests.

## Dependencies
- SP-077

## Context to Read First
- `src/domain/pipeline/router-pipeline.ts` — failure handling
- `src/infra/gemini-provider.ts` — provider failover logic

## File Scope
| Scope | Paths |
|-------|-------|
| Must change | `src/infra/gemini-provider.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract
| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infra/gemini-provider.ts` |
| completionCriteria | 400 thought_signature errors are treated as terminal/client errors, not failover triggers. |

## Steps
### Step 1: Update failover logic
- [ ] Identify thought_signature 400 handling in Gemini provider
- [ ] Ensure terminal error return, not retry

## Testing
- [ ] Add unit test case for 400 thought_signature error

## Completion Criteria
- [ ] All steps complete
- [ ] Tests pass

## Do NOT
- Modify domain layer pipeline logic

---
