# SP-087 Status

**Current Step:** Step 1
**Status:** Ready

## Step 1: Shared registry + resolveModelScope
- [ ] Bind ctx.modelRegistry at session_start
- [ ] Replace filterScopedModels with resolveModelScope
- [ ] Defer initial rebuild until session_start
**Status:** not_started

## Step 2: Fleet cache + invalidation
- [ ] Cache fleet snapshot with scope fingerprint
- [ ] Invalidation triggers (session_start, mode, pricing, fingerprint)
- [ ] Cheap fingerprint check before route
**Status:** not_started

## Step 3: Observability + tests
- [ ] Status lists fleet members
- [ ] Unit tests for shared registry and cache
- [ ] Run npm run typecheck && npm test
**Status:** not_started

## Completion Criteria
- [ ] All acceptance criteria from PROMPT met
- [ ] Tests pass
