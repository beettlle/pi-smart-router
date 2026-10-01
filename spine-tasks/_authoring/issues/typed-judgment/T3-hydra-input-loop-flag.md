## Problem

`resolveLoopPressure` in `src/domain/matching/hydra-input.ts` sets the HyDRA metadata flag `loop:1` with a plain substring grep:

```ts
function looksLikeToolFailure(content: string): boolean {
  const lower = content.toLowerCase();
  return FAILURE_PATTERNS.some((pattern) => lower.includes(pattern));
}
```

This is the same bug class #132 fixed in loop escalation:

- False positive: `"Build finished: no errors, 0 warnings."` → `loop:1`.
- Ignores structured host signals (`is_error`, `status`) that `isToolFailure` in `src/domain/pinning/loop-escalation.ts` already prefers.

The flag feeds the HyDRA encoder input and (after the typed-judgment work, {{EPIC}}) the judge state's `last_tool_failed`.

## Expected

Reuse the loop-escalation precedence: `is_error` → `status >= 400` → tightened body heuristic (benign negations excluded, rate-limit patterns included).

## Acceptance

- [ ] `is_error: true` / `status >= 400` → `loop:1` regardless of body.
- [ ] `is_error: false` / `status < 400` → `loop:0` without body grep.
- [ ] `"no errors"`, `"without failure"` → `loop:0`.
- [ ] `"HTTP 429 Rate limit exceeded"` with no structured signal → `loop:1`.
- [ ] One shared helper (no duplicated failure heuristics between `hydra-input.ts` and `loop-escalation.ts`).

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/hydra-input.test.ts tests/unit/loop-escalation.test.ts
```

## Related

#132 (original fix in loop escalation), {{EPIC}}
