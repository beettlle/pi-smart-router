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
**Status:** In Progress

- [ ] Scoped-fleet table test
- [ ] Haiku, future Claude, gemini-4-flash edge cases
- [ ] Run Contract testCommand
