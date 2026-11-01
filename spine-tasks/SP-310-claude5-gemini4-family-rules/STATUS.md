# SP-310: Family rules for Claude 5.x and Gemini 4 — Status

**Current Step:** Step 2: Testing & Verification
**Status:** In Progress
**Last Updated:** 2026-11-01
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm current tier/source gaps for scoped ids
  - tsx preflight over the nine scoped ids: `claude-fable-5-1` and `gemini-4-argon` confirmed on UNKNOWN_DEFAULTS (economical-cloud, 0.6/0.65/0.6); haiku/opus/sonnet, gemini-3.1-pro(+customtools), flash/flash-lite already correct.

---

### Step 1: Implementation
**Status:** Complete

- [x] Fable / generic Claude / Gemini 4+ / flash-lite rules; customtools parity
  - `src/config/pi-model-mapper.ts`: added `claude[-_.]?fable` (frontier) after the opus/sonnet rule; generic `/claude/i` (frontier) after the Haiku rule; `/gemini.*lite/i` (economical) and `/gemini[-_.]?(?:[4-9]|\d{2,})/i` (frontier) after the existing flash rule. customtools parity holds via the existing `gemini[-_.]?3.*pro` rule (pinned by test in Step 2).

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Scoped-fleet table test
  - `tests/unit/pi-model-mapper.test.ts` — new `SP-310 scoped fleet family rules (#193)` describe: `it.each` over all nine operator scoped ids asserting tiers (fable/opus/sonnet/gemini-4-argon/gemini-3.1-pro±customtools → frontier; haiku/flash/flash-lite → economical), plus a no-UNKNOWN_DEFAULTS fingerprint guard (0.6/0.65/0.6).
- [x] Haiku, future Claude, gemini-4-flash edge cases
  - haiku-5-5 stays 0.7/0.75/0.7 economical; `claude-newfamily-6` → frontier 0.95 pattern_default; `gemini-4-flash` and `gemini-4-lite` → economical (flash/lite rules ahead of Gemini 4+ rule); customtools parity test vs base id; `gemini-flash-lite-latest` stays economical.
- [x] Run Contract testCommand
  - `npm run typecheck` ✓; `npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts` ✓ (68 passed); `bash scripts/spine-stet-contract-run.sh lenient SP-310` ✓ (0 findings).
  - Adjacent consumer suites also green: price-broker, smart-router-extension, pi-extension integration, index-exports (176 passed).
