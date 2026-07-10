# Task: SP-154 — Entropy anomaly detection on prompt tail segments

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** #82 part 1 — length-normalized token entropy checks on prompt tail for adversarial suffix defense.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#82
- Release: v0.6.0
- Bucket: feature

## Mission

Add length-normalized token entropy anomaly detection in deterministic triage to detect adversarial suffix patterns (R2A / Route-to-Rome class attacks). Build on existing confounder sanitization in `triage-engine.ts`. Strip or flag suffixes violating natural language/code distributions. Record entropy metrics for telemetry.

## Dependencies

- None (builds on existing confounder sanitization)

## Context to Read First

- `src/domain/triage/triage-engine.ts`
- `docs/routing-roadmap.md` §3, §8
- GitHub #82 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/triage/entropy-check.ts`, `src/domain/triage/triage-engine.ts` |
| May change | `tests/unit/triage-engine.test.ts`, `src/domain/types/entities.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/triage/entropy-check.ts`, `src/domain/triage/triage-engine.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Entropy module on tail segments; integrated into triage pipeline after sanitize; synthetic high-entropy suffix fixtures pass; no regression on normal prompts corpus. |

## Steps

### Step 1: Entropy check module

- [ ] Implement `entropy-check.ts` with length-normalized token entropy on configurable tail window
- [ ] Define anomaly threshold and strip/flag behavior for high-entropy suffixes
- [ ] Export metrics for triage result (entropy score, tail delta)

### Step 2: Triage integration

- [ ] Wire entropy check into triage pipeline after `sanitize()`
- [ ] Extend `TriageResult` with entropy fields when needed
- [ ] Document false-positive mitigation approach

### Step 3: Testing and verification

- [ ] Unit tests with synthetic high-entropy suffix fixtures
- [ ] Regression test on normal prompts corpus sample
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Entropy anomaly detection on prompt tail segments
- [ ] Strip or flag adversarial suffixes in triage path
- [ ] Unit tests with synthetic fixtures
- [ ] No regression on normal prompts corpus
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-154): description`

## Do NOT

- SAE residual-stream defense (deferred)
- RouteLLM MF head (deferred)

---
