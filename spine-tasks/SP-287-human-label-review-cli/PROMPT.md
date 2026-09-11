# Task: SP-287 — human label review CLI

**Created:** 2026-09-11
**Size:** M

## Review Level: 1

**Assessment:** Close-#168 operator tooling; bounded calibration scripts scope.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#168
- Release: v1.1.0
- Manifest: `spine-tasks/_authoring/release-v1.1.0/manifest.md`
- Plan: human review + live labels (hold publish until hard gates pass)

## Mission

Add a human-label review CLI that imports shadow telemetry-contrib/dataset exports and SP-282 disagreement reports, queues one item at a time (good/bad/skip/quit), and emits contrib rows with `label_provenance: human_feedback`. Never invent labels for skipped items; never auto-promote untagged legacy rows. Document operator usage; unit-test I/O schema, skip/quit semantics, provenance write, and tainted-key rejection.

## Dependencies

- SP-282
- SP-281

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `spine-tasks/_authoring/release-v1.1.0/hard-gate-ship-note.md`
- `scripts/calibration/README.md`
- `docs/qa/shadow-dogfood-protocol.md`
- Issue beettlle/pi-smart-router#168

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/calibration/human-label-review.ts`, `tests/unit/human-label-review.test.ts`, `scripts/calibration/README.md` |
| May change | `scripts/calibration/adversarial-label-campaign.ts` (embed `disagreements` in report), `docs/qa/shadow-dogfood-protocol.md`, `spine-tasks/CONTEXT.md`, `spine-tasks/dependencies.json` |
| Must NOT change | `config/p-success-weights.json`, `config/routing-calibration.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npx vitest run tests/unit/human-label-review.test.ts` |
| fileScopeMustChange | `scripts/calibration/human-label-review.ts`, `tests/unit/human-label-review.test.ts`, `scripts/calibration/README.md` |
| fileScopeMustNotChange | `config/p-success-weights.json`, `config/routing-calibration.json` |

## Steps

1. Implement `scripts/calibration/human-label-review.ts` with import/queue/emit as specified.
2. Embed `disagreements[]` on SP-282 campaign reports so the review CLI can load them.
3. Add unit tests for schema, skip, provenance, tainted keys.
4. Document operator section in calibration README + pointer from shadow-dogfood protocol.
5. Run contract `testCommand`; leave shipped config untouched.

## Acceptance

- [ ] Review CLI emits only `label_provenance: human_feedback` on good/bad
- [ ] Skip/quit invents no rows
- [ ] Tainted prompt keys rejected
- [ ] Campaign report carries `disagreements` for queue import
- [ ] Docs updated; shipped `config/*` unchanged
- [ ] `npx vitest run tests/unit/human-label-review.test.ts` exit 0
