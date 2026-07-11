# Update comment / body for GitHub #95

**Title (keep or refine):** Shadow dogfood protocol + public-track release soft-feed

**Action:** Edit existing issue #95 (do not create a duplicate).

---

## Problem

Live quality-first routing is not yet proven under real pi workloads. TwinRouterBench CI corpus soft-feed shows ~0.85 over-routing vs absolute max 0.15. Community Track B (`--dogfood-export`) still skips until a dogfood→harness adapter exists. We need a frozen human protocol and clear go/no-go criteria before relaxing frugality or promoting absolute corpus gates.

## Acceptance criteria

- [ ] Written protocol exists at `docs/qa/shadow-dogfood-protocol.md` and is linked from README (TwinRouterBench / #95 section).
- [ ] Offline companion available: `npm run qa:shadow-dogfood` archives hard + soft reports under `.pi-smart-router/qa-runs/`.
- [ ] Dogfood window completed covering the session matrix (≥5 sessions / all matrix rows) **or** ≥30 labeled economical-tier dataset rows (prefer passive/behavioral labels).
- [ ] Dataset + telemetry-contrib exports archived; privacy check confirms no prompt text.
- [ ] Soft corpus report archived: `npm run routing:assert-release-gates:corpus-report`.
- [ ] Hard fixture gates green: `npm run release:functional-smoke`.
- [ ] Sign-off form posted on this issue (go / no-go / needs more data).
- [ ] Track B remains skipped until the Track B adapter issue closes — **never invent labels**.
- [ ] Explicit: do **not** relax frugality defaults or flip absolute corpus thresholds without separate operator approval.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Live sessions, exports, sign-off | Human QA (`docs/qa/shadow-dogfood-protocol.md`) |
| Offline hard/soft archive script | Landed (`qa:shadow-dogfood`) |
| Dogfood export → harness Track B | Autonomous follow-on issue |
| Corpus over-routing root-cause | Autonomous follow-on issue |

## Commands / files

- `docs/qa/shadow-dogfood-protocol.md`
- `scripts/qa/shadow-dogfood-session.sh`
- `config/release-gates.json` (read-only for this issue)
- `npm run release:functional-smoke`
- `npm run routing:assert-release-gates:corpus-report`

## Out of scope

- Implementing Track B adapter
- Changing absolute release-gate thresholds
- Encoder default flips (#96)
- Synthetic label invention for harness fixtures

## Links

- Protocol: `docs/qa/shadow-dogfood-protocol.md`
- Authoring drafts: `spine-tasks/_authoring/issues/`
