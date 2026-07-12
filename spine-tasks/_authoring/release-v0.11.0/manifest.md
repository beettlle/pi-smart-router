# Release manifest — v0.11.0

**Created:** 2026-07-11
**Current version:** 0.10.0
**Target version:** v0.11.0
**Bump type:** minor
**Profile:** minor
**Theme:** Dogfood eval readiness — Track B adapter, TwinRouterBench over-routing root-cause, and encoder #96 go/no-go evidence
**Operator approved scope:** yes (2026-07-11 — recommended + #113)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Dogfood eval readiness (Track B + over-routing + encoder evidence) | required | PASS |
| Documentation | 0 labeled (reports ship inside enh tasks) | theme docs OK | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 3 (#112, #111, #113) | minor 1–3 related | PASS |
| **Total tasks** | 3 | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none (minor)

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-202 | #112 | enh | M | TwinRouterBench over-routing analysis | Closes #112; report only — no absolute gate edits |
| SP-203 | #111 | enh | M | Track B dogfood export → harness adapter | Closes #111; Partial #95 live-traces AC |
| SP-204 | #113 | enh | M | Pack holdout ECE + encoder latency go/no-go | Closes #113; feeds #96; no default flip |

**Release scope ID:** `SP-202,SP-203,SP-204`

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-202 SP-203 SP-204
spine plan SP-202,SP-203,SP-204
spine run sequence SP-202,SP-203,SP-204 --dry-run
spine batch start SP-202,SP-203,SP-204 --wave 1
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Manifest scope — approved 2026-07-11
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #112 | enh | SP-202 | create-spine-tasks (lean) |
| #111 | enh | SP-203 | create-spine-tasks (lean) |
| #113 | enh | SP-204 | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
Wave 1: SP-202, SP-203, SP-204 (disjoint file scopes; maxParallel 3)
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #96 | enh | Product enablement tracker — waits on SP-204 evidence + operator approve |
| #110 | enh | Behavioral calibration needs human dogfood volume from #95 |
| #95 | enh | Remains open for human live sessions / sign-off (Partial via SP-196) |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- SP-204 may lack ONNX weights locally — packet must document blockers without inventing metrics
- SP-202 must not silently harden corpus into `release:functional-smoke`
- SP-203 must never invent dogfood outcome labels

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave**
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **minor**
- [ ] `npm version minor` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches 0.11.0
