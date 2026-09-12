# Task: SP-288 — pi-CLI adversarial clients

**Created:** 2026-09-12
**Size:** M

## Review Level: 1

**Assessment:** Thin adapter on SP-282 harness; bounded scripts/calibration scope.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#169 (primary), #168, #110
- Release: v1.1.0 follow-on
- Plan: Pi-CLI live adversarial campaign clients

## Mission

Add pi-CLI client mode to the adversarial labeling harness so live campaigns use the operator’s scoped pi `enabledModels` without `ADVERSARIAL_LABEL_API_KEY`. Never assign `cursor/auto` as a grader; exclude `smart-router/*` from generators and graders. Document operator usage; unit-test pick/filter/spawn; comment on #169/#168/#110.

## Dependencies

- SP-282

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `scripts/calibration/adversarial-label-campaign.ts`
- `scripts/calibration/README.md`
- Issues #169, #168, #110

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None for unit tests; live smoke needs pi auth (operator-optional)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/calibration/pi-cli-clients.ts`, `scripts/calibration/adversarial-label-campaign.ts`, `tests/unit/pi-cli-adversarial-clients.test.ts`, `scripts/calibration/README.md` |
| May change | `spine-tasks/CONTEXT.md`, `spine-tasks/dependencies.json`, `spine-tasks/_authoring/release-v1.1.0/operator-notes-issues.md` |
| Must NOT change | `config/p-success-weights.json`, `config/routing-calibration.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npx vitest run tests/unit/pi-cli-adversarial-clients.test.ts tests/unit/adversarial-label-campaign.test.ts` |
| fileScopeMustChange | `scripts/calibration/pi-cli-clients.ts`, `scripts/calibration/adversarial-label-campaign.ts`, `tests/unit/pi-cli-adversarial-clients.test.ts`, `scripts/calibration/README.md` |
| fileScopeMustNotChange | `config/p-success-weights.json`, `config/routing-calibration.json` |

## Steps

1. Implement `scripts/calibration/pi-cli-clients.ts` (scope load, pick, spawn clients).
2. Wire `--pi-cli`, `--from-scoped-models`, `--pi-settings` into the campaign CLI.
3. Add unit tests; keep existing campaign tests green.
4. Update calibration README + operator-notes for #169 pi-CLI path.
5. Comment on GitHub #169, #168, #110 (do not close).

## Acceptance

- [ ] `--pi-cli --from-scoped-models` picks ≥2 gens + ≥2 graders from `enabledModels`
- [ ] `cursor/auto` never used as grader; `smart-router/*` excluded from both
- [ ] Recorded and OpenAI-live modes unchanged
- [ ] Unit tests pass; shipped config untouched
- [ ] Issues #169/#168/#110 commented
