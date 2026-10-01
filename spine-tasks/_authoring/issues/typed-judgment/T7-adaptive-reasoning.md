## Summary

Feed the typed judgment's `needs_deep_reasoning` probability into the adaptive reasoning policy (#166) so thinking level follows the task, not only the turn envelope. Epic: {{EPIC}}.

## Priority

P2

## Pipeline stages

Delegation: `resolveAdaptiveReasoning` in `src/domain/delegation/adaptive-reasoning.ts`.

## Problem / motivation

Adaptive reasoning classifies turns from turn envelope / stage signals (`routine`, `planning`, `escalation`, `unknown`). A short prompt like "find out why the websocket double-delivers after a network flap" is `main_loop` → low thinking, though it needs deep reasoning. The judge rated that case deep reasoning 1.00; trivial prompts 0.00.

## Proposed solution

- [ ] Extend `AdaptiveReasoningSignal` with optional `deepReasoningP` (from `RoutingDecision.features`).
- [ ] Policy: `deepReasoningP ≥ high threshold` upgrades the turn class (e.g. to `planning` level); `≤ low threshold` on `main_loop` allows `low`/`minimal`. Thresholds in `adaptive_reasoning` config.
- [ ] Existing invariants hold: explicit higher operator `/thinking` wins; floor/ceiling apply; unsupported models fail open.
- [ ] New reason codes: `typed_judgment_deep_reasoning`, `typed_judgment_shallow`.
- [ ] Missing judgment → current behavior.

## Dependencies

| Issue | Role |
|-------|------|
| {{T4}} | Judgment in decision features |
| #166 | Adaptive reasoning policy (closed) |

## Out of scope

- Changing default floor/ceiling.

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/adaptive-reasoning.test.ts
```

- Policy matrix with/without judgment; operator higher thinking still wins; ceiling caps upgrades.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Policy + tests | Autonomous |
