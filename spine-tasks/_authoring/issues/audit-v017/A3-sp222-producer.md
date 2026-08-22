## Summary

Finish SP-222 at the extension producer: `mapContextMessages` must populate structured failure signals so loop-escalation does not rely on body heuristics alone.

## Priority

P0

## Pipeline stages

`.pi/extensions/smart-router/routing-context.ts`, `src/domain/pinning/loop-escalation.ts`

## Problem / motivation

#132 closed domain-side structured failure handling, but `mapContextMessages` in the extension never sets `status`, hardcodes `tool_blocks: []`, and concatenates assistant `thinking` into routing `content`. The `status >= 400` short-circuit in `loop-escalation.ts` cannot fire for Pi-hosted traffic.

## Proposed solution

- [ ] Map Pi message `status` into `Message.status` when present.
- [ ] Map tool metadata into `tool_blocks` (not empty array) when Pi provides it.
- [ ] Stop concatenating `thinking` blocks into routing `content` (or gate behind explicit opt-in).
- [ ] Ensure `is_error` mapping remains correct for tool results.
- [ ] Add extension integration test: producer → `RouterPipeline.route()` → loop-escalation sees structured signal.
- [ ] Keep Zod `MessageSchema` and `routing-request.schema.json` in sync (coordinate with contract sync issue).

## Evidence

- `.pi/extensions/smart-router/routing-context.ts` — `mapContextMessages` ~lines 120–152
- `src/domain/pinning/loop-escalation.ts` — `status >= 400` path
- Closed #132 AC: “Extension/host path … actually populates is_error/status” — unchecked

## Dependencies

| Issue | Role |
|-------|------|
| #132 (closed) | Parent — comment linking here as follow-on |
| Contract sync issue | Message schema alignment |

## Out of scope

- Reopening #132 implementation debate
- #96, #110

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/loop-escalation.test.ts
npx vitest run tests/unit/smart-router-extension.test.ts -t "mapContext"
# Integration: status>=400 escalates without body keyword grep
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Producer wiring + tests | Autonomous |
