# Task: SP-079 — Add /smart-router unpin subcommand

**Created:** 2026-07-05
**Size:** S

## Mission
Add `/smart-router unpin` subcommand to support dogfooding and testing of session pinner behavior.

## Dependencies
- SP-078

## Context to Read First
- `src/cli/smart-router-cli.ts` — CLI command registration
- `src/domain/session-pinner.ts` — pinner logic

## File Scope
| Scope | Paths |
|-------|-------|
| Must change | `src/cli/smart-router-cli.ts` |
| Must NOT change | `src/domain/session-pinner.ts` |

## Contract
| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/cli/smart-router-cli.ts` |
| completionCriteria | `/smart-router unpin` subcommand is added and functional. |

## Steps
### Step 1: Add command
- [ ] Register `unpin` subcommand in CLI
- [ ] Hook into session pinner unpin logic

## Testing
- [ ] Add unit test for CLI command invocation

## Completion Criteria
- [ ] All steps complete
- [ ] Tests pass

## Do NOT
- Modify session pinner core domain logic

---
