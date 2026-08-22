# SP-225: mapContextMessages structured failure producer — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Step 1: Wire mapContextMessages producer

**Status:** Complete

- [x] Map status and tool_blocks
- [x] Fix thinking concatenation
- [x] Preserve is_error mapping

## Step 2: Testing and verification

**Status:** Complete

- [x] Extension + loop-escalation tests
- [x] Contract `testCommand` — typecheck + both vitest files pass (127 tests)
- [x] `npm run verify:ci` — build, typecheck, lint, coverage:check all pass (1880 tests, 93.05% lines)

---

## Completion Criteria

- [x] Structured signals reach loop-escalation — producer maps `status` (message-level or `details.status`),
  `tool_blocks` (tool_call/tool_result metadata), and leaves `is_error` undefined when a structured status
  is present so the domain `status >= 400` rule arbitrates (#137)
- [x] #137 closable — integration test proves producer → `RouterPipeline.route()` → loop-escalation
  escalates to frontier on `status: 503` with zero failure keywords in the body

## Discoveries

- Thinking is now excluded from routing `content` by default; opt-in via
  `SMART_ROUTER_INCLUDE_THINKING=1` or `mapContextMessages(..., { includeThinking: true })`.
- Zod `MessageSchema` / `routing-request.schema.json` still lack `tool_blocks` — left unchanged per
  #137's "coordinate with contract sync issue" note (separate contract-sync task owns schema alignment).
- Plan review at Step 1 returned engine-skipped (real-pi worker session; engine runs reviews post-.DONE).
