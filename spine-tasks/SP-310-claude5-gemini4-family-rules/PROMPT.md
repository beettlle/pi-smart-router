# Task: SP-310 — Family rules for Claude 5.x and Gemini 4

**Created:** 2026-10-24
**Size:** S

## Review Level: 1

**Assessment:** Pattern-rule gap — `claude-fable-5-1` and `gemini-4-argon` fall to `UNKNOWN_DEFAULTS` (economical, 0.6 capabilities), so the router treats current flagship models as mid-tier unknowns.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#193
- Release: v1.3.0 (operator-approved fourth enhancement, 2026-10-24)
- Bucket: feature
- Partial: #193 (family rules; grounding in SP-311, mixed-source fairness in SP-312)

## Mission

Operator scoped fleet (2026-10-24, `~/.pi/agent/settings.json` `enabledModels`): `anthropic/claude-fable-5-1`, `anthropic/claude-haiku-5-5`, `anthropic/claude-opus-5-5`, `anthropic/claude-sonnet-5-5`, `google/gemini-4-argon`, `google/gemini-3.1-pro-preview`, `google/gemini-3.1-pro-preview-customtools`, `google/gemini-flash-latest`, `google/gemini-flash-lite-latest`.

Update `MODEL_PATTERN_RULES` in `src/config/pi-model-mapper.ts` (first match wins — order matters):

- `claude-fable-*` → `FRONTIER_DEFAULTS`.
- Any other `claude-*` id that is not Haiku → `FRONTIER_DEFAULTS` (future Claude families should not drop to unknown). Haiku stays `ECONOMICAL_DEFAULTS`; keep the Haiku rule ahead of the generic Claude rule. Anchor the generic rule to a leading `claude` token (start of id or after `/`, followed by `-`, `_`, or `.`), e.g. `/(?:^|\/)claude[-_.]/i` — a bare `/claude/i` also matches ids like `openai-claude-bridge` (stet finding on the first attempt). Add a test that `openai-claude-bridge` does not get `FRONTIER_DEFAULTS` from the Claude rule.
- Gemini major version ≥ 4 (e.g. `gemini-4-argon`, `gemini-4-pro`) → `FRONTIER_DEFAULTS`, **unless** the id contains `flash` or `lite` → `ECONOMICAL_DEFAULTS`. Place the flash/lite rule before the generic Gemini 4+ rule.
- `gemini-*-customtools` resolves exactly like its base id (strip the suffix before matching or rely on the existing `gemini.*pro` rule — test it either way).
- `gemini-flash-lite-latest` stays economical.
- Do not change Cursor, GLM, DeepSeek, GPT, or local rules.

## Dependencies

- None

## Context to Read First

- `src/config/pi-model-mapper.ts` (`MODEL_PATTERN_RULES`, `FRONTIER_DEFAULTS`, `ECONOMICAL_DEFAULTS`, `UNKNOWN_DEFAULTS`)
- `tests/unit/pi-model-mapper.test.ts`, `tests/unit/pi-model-mapper-coverage.test.ts`
- Issue beettlle/pi-smart-router#193

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts`, `tests/unit/pi-model-mapper.test.ts` |
| May change | `tests/unit/pi-model-mapper-coverage.test.ts` |
| Must NOT change | `package.json`, `config/benchmark-profiles.json`, `src/domain/**`, `scripts/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts && bash scripts/spine-stet-contract-run.sh lenient SP-310` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts`, `tests/unit/pi-model-mapper.test.ts` |
| fileScopeMustNotChange | `package.json`, `config/benchmark-profiles.json`, `src/domain/`, `.review/` |
| completionCriteria | Every id in the operator scoped fleet maps to the intended tier; no Claude or Gemini 4 id falls to UNKNOWN_DEFAULTS; existing mapper tests unchanged and green |

## Steps

### Step 0: Preflight

- [ ] Print current tier + `capability_source` for each scoped id via a quick test to confirm the gaps

### Step 1: Implementation

- [ ] Add Fable / generic Claude / Gemini 4+ / flash-lite rules in the correct order; customtools parity

### Step 2: Testing & Verification

- [ ] Table test over the nine scoped ids above with expected tiers (Fable, Opus, Sonnet, Gemini 4 Argon, Gemini 3.1 Pro, Gemini 3.1 Pro customtools → frontier; Haiku, Gemini Flash, Gemini Flash Lite → economical)
- [ ] `claude-haiku-*` still economical; hypothetical `claude-newfamily-6` → frontier; `gemini-4-flash` → economical
- [ ] Run Contract `testCommand`

## Do NOT

- Edit benchmark artifacts (SP-311)
- Change default capability numbers (SP-312)

## Completion Criteria

- [ ] #193 family-rule items met
- [ ] Contract tests green
