# Task: SP-178 — SAAR Pin-Break + History Model ID

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Break wrong-tier SAAR pins on unsupported tools / zero-tier tool churn, and surface the real delegated model id in history/telemetry.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#99
- Bucket: feature
- Closes: #99

## Mission

Once `local_zero` wins turn 1, SAAR pins that model for the session. Loop escalation only fires on repeated identical tool failures, not unsupported/unknown tools or clear agentic escalation while pinned to zero-tier. Add observational pin-break (or re-route) when unsupported/unknown tools appear, or after N tool calls while pinned to zero-tier — without fighting SAAR cache economics (align with existing breakeven / loop-escalation patterns). Also fix `/smart-router history` (and LOG_ROUTING if needed) so operators see the actual delegated model id, not virtual `auto`. Confirm LOG_ROUTING fields (`stage`, `reason_code`, `low_intensity_score`, `tier_hint`, `local_eligible_reason`, `cluster_id`) and document remaining gaps. Tests for pin-break path + history field.

## Dependencies

- **None**

## Context to Read First

- `src/domain/pinning/loop-escalation.ts` — `evaluateLoopEscalation`
- `src/domain/pinning/session-pinner.ts` — pin record / break APIs
- `src/domain/pipeline/router-pipeline.ts` — where escalation is evaluated (touch only if wiring required; prefer pinning module changes)
- `src/infrastructure/telemetry/routing-telemetry.ts` — `buildRoutingDecisionLogPayload`
- `.pi/extensions/smart-router/command-formatters.ts`, `.pi/extensions/smart-router/commands.ts` — history UX
- `tests/unit/loop-escalation.test.ts`, `tests/unit/session-pinner.test.ts`, `tests/unit/routing-telemetry.test.ts`, `tests/unit/smart-router-cli.test.ts`
- GitHub #99 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/loop-escalation.ts`, `.pi/extensions/smart-router/command-formatters.ts` |
| May change | `src/domain/pinning/session-pinner.ts`, `src/domain/pipeline/router-pipeline.ts`, `src/infrastructure/telemetry/routing-telemetry.ts`, `.pi/extensions/smart-router/commands.ts`, `.pi/extensions/smart-router/routing-outcomes.ts`, `tests/unit/loop-escalation.test.ts`, `tests/unit/session-pinner.test.ts`, `tests/unit/routing-telemetry.test.ts`, `tests/unit/smart-router-cli.test.ts`, `README.md` |
| Must NOT change | `src/domain/triage/**`, `config/benchmark-profiles.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/loop-escalation.test.ts tests/unit/session-pinner.test.ts tests/unit/routing-telemetry.test.ts tests/unit/smart-router-cli.test.ts` |
| fileScopeMustChange | `src/domain/pinning/loop-escalation.ts`, `.pi/extensions/smart-router/command-formatters.ts` |
| fileScopeMustNotChange | `src/domain/triage/**` |
| completionCriteria | Observational pin-break on unsupported/unknown tools or N tool calls on zero-tier pin; history/LOG_ROUTING show delegated model id not virtual auto; LOG_ROUTING field checklist confirmed/documented; tests for pin-break + history field. |

## Steps

### Step 1: Observational pin-break

- [ ] Extend loop-escalation / pinner so unsupported/unknown tools or N tool calls while pinned to zero-tier can break/re-route
- [ ] Align with existing SAAR / breakeven / loop-escalation patterns (document the rule in code comments or README briefly)
- [ ] Unit tests for the new pin-break path

### Step 2: History + LOG_ROUTING delegated model id

- [ ] `/smart-router history` surfaces actual delegated model id, not virtual `auto`
- [ ] Confirm `SMART_ROUTER_LOG_ROUTING=1` includes `stage`, `reason_code`, `low_intensity_score`, `tier_hint`, `local_eligible_reason`, `cluster_id`; document any remaining gaps
- [ ] Tests for history field / formatter

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/loop-escalation.test.ts tests/unit/session-pinner.test.ts tests/unit/routing-telemetry.test.ts tests/unit/smart-router-cli.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Observational pin-break (or re-route) on unsupported/unknown tools or N tool calls on zero-tier pin
- [ ] Documented alignment with SAAR cache economics / existing escalation patterns
- [ ] History (and LOG_ROUTING if needed) shows concrete delegated model id, not `auto`
- [ ] LOG_ROUTING field checklist confirmed; gaps documented
- [ ] Tests for pin-break path + history field

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | `README.md` (LOG_ROUTING / history fields; pin-break rule) |

## Git Commit Convention

- `feat(SP-178): description`

## Do NOT

- Reimplement triage cleanup keywords (#97 / SP-176)
- Reimplement local_zero tool-use gate (#98 / SP-177)
- Disable SAAR entirely or ignore cache-breakeven without a documented rule
- Invent new telemetry fields without wiring them into the existing log payload builder

---

## Amendments (Added During Execution)
