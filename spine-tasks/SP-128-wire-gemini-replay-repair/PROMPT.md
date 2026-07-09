# Task: SP-128 — Wire Gemini Replay Repair in Delegation Path

**Created:** 2026-07-08
**Size:** S

## Review Level: 1

**Assessment:** Integration — call SP-127 repair at delegation boundary before pi-ai delegateStream.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#85
- Release: v0.2.0
- Bucket: feature

## Mission

Wire `repairGeminiReplayContext` from SP-127 into `buildDelegationContext` in `.pi/extensions/smart-router/delegation-runtime.ts` so every Google-target delegation receives repaired replay state before `delegateStream`.

After `normalizeDelegationContext(...)`, when `isGoogleDelegationTarget(targetModel)`:

```typescript
return repairGeminiReplayContext(normalized, targetModel, sessionExecution);
```

Add extension unit test: multi-turn context with prior Gemini `toolCall` + `thoughtSignature`, router selects a **different** Gemini model — assert mock `delegateStream` receives context with aligned identity and signature/sentinel on toolCall blocks.

## Dependencies

- **Task:** SP-127

## Context to Read First

- `.pi/extensions/smart-router/delegation-runtime.ts` — `buildDelegationContext`
- `src/domain/delegation/delegation-context.ts` — SP-127 exports
- `tests/unit/smart-router-extension.test.ts` — existing virtual-router replay test (~line 668)
- `.pi/extensions/smart-router/route-and-delegate.ts` — read-only; do not change failover (SP-075)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/delegation-runtime.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/delegation/delegation-context.ts` (SP-127 owns), `.pi/extensions/smart-router/route-and-delegate.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/delegation-runtime.ts` |
| fileScopeMustNotChange | `src/domain/delegation/delegation-context.ts`, `.pi/extensions/smart-router/route-and-delegate.ts` |
| completionCriteria | buildDelegationContext applies repair for Google targets; extension test asserts cross-model Gemini replay context passed to delegateStream. |

## Testing

- Extension: `tests/unit/smart-router-extension.test.ts` — cross-model Gemini replay delegation
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Wire repair in buildDelegationContext

- [ ] Import SP-127 helpers
- [ ] Apply repair after normalizeDelegationContext for Google targets only

### Step 2: Extension unit test

- [ ] Multi-turn Gemini tool history with cross-model delegation
- [ ] Assert delegateStream context has aligned provider/model and thoughtSignature/sentinel

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] Repair runs on every Google-target delegation
- [ ] Non-Google delegation path unchanged
- [ ] Extension test covers cross-model Gemini replay
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-128): description`

## Do NOT

- Modify delegation-context repair logic (SP-127)
- Change route-and-delegate failover or thought_signature terminal path (SP-075)
- Change tool-history guard (SP-129)

---

## Amendments (Added During Execution)
