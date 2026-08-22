# Task: SP-225 — mapContextMessages structured failure producer

**Created:** 2026-08-22
**Size:** M

## Review Level: 1

**Assessment:** Finish SP-222 extension producer — map Pi status/tool metadata for loop-escalation.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#137
- Bucket: bug
- Closes: #137
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #137 — `mapContextMessages` must populate structured failure signals: map Pi `status` into `Message.status`, map tool metadata into `tool_blocks` (not hardcoded `[]`), stop concatenating `thinking` into routing `content` (or gate behind opt-in). `loop-escalation.ts` `status >= 400` path must fire for Pi-hosted traffic. Add integration test: producer → `route()` → loop-escalation sees structured signal.

## Dependencies

- None

## Context to Read First

- `.pi/extensions/smart-router/routing-context.ts` — `mapContextMessages` ~120–152
- `src/domain/pinning/loop-escalation.ts`
- `src/domain/types/schemas.ts` — `MessageSchema`
- Closed #132 for domain-side context

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/routing-context.ts`, `tests/unit/smart-router-extension.test.ts`, `tests/unit/loop-escalation.test.ts` |
| May change | `src/domain/types/entities.ts`, `src/domain/types/schemas.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` policy stages |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/loop-escalation.test.ts tests/unit/smart-router-extension.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/routing-context.ts` |
| fileScopeMustNotChange | `config/release-gates.json` |
| completionCriteria | status/tool_blocks mapped; thinking not leaked into content; integration test proves loop-escalation structured path; #137 closable |

## Steps

### Step 1: Wire mapContextMessages producer

- [ ] Map Pi message `status` when present
- [ ] Map tool metadata into `tool_blocks`
- [ ] Fix thinking concatenation (remove or opt-in gate)
- [ ] Preserve correct `is_error` for tool results

### Step 2: Testing and verification

- [ ] Extension test: `mapContext` populates structured fields
- [ ] Integration: status≥400 escalates without body keyword grep
- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Structured signals reach loop-escalation from extension path
- [ ] Tests cover producer → escalation path
- [ ] #137 closable

## Do NOT

- Reopen #132 domain debate
- Flip encoder defaults
