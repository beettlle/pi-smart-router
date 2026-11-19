# Task: SP-323 — Session-depth / flash-class main_loop capability floor

**Created:** 2026-11-19
**Size:** M

## Review Level: 2

**Assessment:** Deep sessions must not select flash-class models for main_loop when a higher-capability fleet peer exists.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 2

## Source

- GitHub: beettlle/pi-smart-router#179
- Epic: beettlle/pi-smart-router#182
- Release: v1.5.0
- Bucket: feature
- Partial: #179 (floor; tool_result re-check in SP-324)
- Partial: #182

## Mission

On deep agentic sessions, HyDRA can match a terse continuation to a flash-class model (`glm-5.3-flash` incident). Add a **deterministic main_loop capability floor**:

1. Define flash-class (id pattern `flash|lite|mini|nano` and/or capability thresholds) in one shared helper exported for #188 consumers.
2. When session depth exceeds thresholds (issue AC: >1,000 messages **or** >100k estimated tokens), exclude flash-class from `main_loop` when a higher-capability model is in the fleet; or require reasoning/tool_use ≥ configured floor.
3. Prefer `turn_envelope` / hydra candidate filtering over post-hoc swaps. Record why the floor applied in LOG_ROUTING / features.
4. Judgment alone does **not** fix this (#183 evidence) — keep deterministic.

## Dependencies

(none)

## Context to Read First

- Issue #179 acceptance criteria + #182 epic checklist
- `src/domain/pipeline/turn-envelope-stage.ts`, `src/domain/triage/turn-envelope.ts`
- `src/domain/routing/tier-features.ts` (`message_count`)
- `src/config/pi-model-mapper.ts` (flash patterns)
- `src/domain/pipeline/hydra-match-stage.ts` (candidate selection)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/turn-envelope-stage.ts`, `src/domain/routing/flash-class.ts`, `tests/unit/turn-envelope.test.ts`, `tests/unit/flash-class.test.ts` |
| May change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pipeline/hydra-match-stage.ts`, `src/domain/types/entities.ts`, `tests/unit/router-pipeline-turn-envelope.test.ts` |
| Must NOT change | `.pi/extensions/`, `src/infrastructure/`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/turn-envelope.test.ts tests/unit/flash-class.test.ts tests/unit/router-pipeline-turn-envelope.test.ts && bash scripts/spine-stet-contract-run.sh default SP-323` |
| fileScopeMustChange | `src/domain/pipeline/turn-envelope-stage.ts`, `tests/unit/turn-envelope.test.ts` |
| fileScopeMustNotChange | `.pi/extensions/`, `src/infrastructure/`, `package.json`, `.review/` |
| completionCriteria | Deep-session short continuation does not pick flash-class for main_loop when higher-capability peer exists; flash-class helper reusable; tests green |

## Steps

### Step 0: Preflight

- [ ] Locate main_loop candidate selection + session depth signals
- [ ] Confirm test fixtures for message_count / token estimates

### Step 1: Flash-class helper + floor

- [ ] Shared flash-class definition
- [ ] Apply floor on main_loop when depth/token thresholds met

### Step 2: Testing & Verification

- [ ] Routing test from #179 AC (depth or tokens + short prompt)
- [ ] Shallow sessions unchanged
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step

## Do NOT

- Implement first-tool_result re-check (SP-324)
- Consume typed_judgment yet (SP-326)

## Completion Criteria

- [ ] Partial #179 floor AC met
- [ ] Contract green

## Git Commit Convention

`feat(SP-323): session-depth flash capability floor (#179)`
