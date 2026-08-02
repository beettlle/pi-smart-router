# Release manifest — v0.14.0

**Created:** 2026-08-02
**Current version:** 0.13.0
**Target version:** v0.14.0
**Bump type:** minor
**Profile:** minor
**Theme:** Routing session resilience — degraded neural failover sandwich when encoder/neural stages fail, bounded planning_delegate / fan-out timeouts, and a live/estimated quota window feed so virtual cost v2 can soft-bias late-window subscription spend.
**Operator approved scope:** yes (2026-08-02 — full SP-212–SP-214)

**Note:** Operator originally requested v0.13.1 (patch). Intake found 0 open bugs / 0 open docs / 0 pending tasks; all open issues are enhancements. Operator chose reclassify to **minor v0.14.0** and selected #119 + #120 + #125.

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Routing session resilience (failover + timeouts + quota feed) | required | PASS |
| Documentation | 0 standalone (docs land inside enhancement packets) | theme docs OK | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 3 related (#119, #120, #125) | minor 1–3 related | PASS |
| **Total tasks** | 3 (gaps → SP-212–SP-214) | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** n/a (minor)

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-212 | #119 | enh | M | Degraded neural failover sandwich (heuristic/learned/pattern) | Closes #119 |
| SP-213 | #120 | enh | M | Bounded timeouts for planning_delegate / parallel fan-out | Closes #120 |
| SP-214 | #125 | enh | M | Live / estimated quota window feed for virtual cost v2 | Closes #125 |

**Release scope ID:** `SP-212,SP-213,SP-214`

**Human QA (not in scope):** #95 shadow dogfood remains human-gated. #110 stays open until real exports. #96/#114 encoder enablement deferred to a separate theme.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-212 SP-213 SP-214
spine plan SP-212,SP-213,SP-214
spine run sequence SP-212,SP-213,SP-214 --dry-run
```

**Wave order (from `spine plan`):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | SP-212, SP-213, SP-214 | 3 lanes in parallel — disjoint File Scope |

```bash
spine batch start SP-212,SP-213,SP-214 --wave N
# land: spine gate approve && spine integrate && npm install && spine batch complete
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${N}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (scope + theme) — **awaiting**
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #119 | enh | SP-212 | create-spine-tasks (lean) |
| #120 | enh | SP-213 | create-spine-tasks (lean) |
| #125 | enh | SP-214 | create-spine-tasks (lean) |

All packets are **gaps** — `spine plan pending` is empty (210 `.DONE`); Next Task ID = SP-212.

---

## Wave plan snapshot

```text
Spine plan — ids
3 task(s) · 1 wave(s) · maxParallel 3

Wave 0 · 3 tasks · 3 lanes in parallel
  Lane 1: SP-212 — Degraded Neural Failover Sandwich
  Lane 2: SP-213 — Bounded Planning Delegate Timeouts
  Lane 3: SP-214 — Quota Window Feed for Virtual Cost v2

Deps: none (all independent)
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #95 | human QA | Shadow dogfood; needs live sessions/exports |
| #110 | enh | Behavioral calibration blocked on #95 exports |
| #96 / #114 | enh | Encoder enablement / Top-1 — separate theme |
| #115 / #116 / #117 | enh | Colibri heat / plan-doctor / prewarm — next-capability theme |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- Hot-file serialization: `.pi/extensions/smart-router/index.ts`, `src/domain/pipeline/router-pipeline.ts`, planning_delegate paths — do not parallel-edit shared paths in one wave.
- Do **not** flip encoder defaults (`modernbert_k4`) or absolute `config/release-gates.json` in this release.
- #125 must degrade (adapter → telemetry estimate → omit); no fake universal remaining-quota probe.
- #119 learned store must not persist raw prompt text (privacy).

---

## Intake table (Phase 1)

| Issue # | Labels | Mapped SP-* | Bucket | Theme fit | Profile fit | Notes |
|---------|--------|-------------|--------|-----------|-------------|-------|
| #119 | enhancement | — (gap → SP-212) | enh | ✓ failover | minor ✓ | llm-use sandwich |
| #120 | enhancement | — (gap → SP-213) | enh | ✓ timeouts | minor ✓ | planning_delegate |
| #125 | enhancement | — (gap → SP-214) | enh | ✓ quota feed | minor ✓ | virtual cost v2 feed |
| #95 | enhancement | SP-196 Partial | human QA | adjacent | defer | Human sessions |
| #110 | enhancement | SP-205/206 Partial | enh | adjacent | defer | Needs #95 |
| #96/#114 | enhancement | — | enh | ✗ encoder | defer | Separate theme |
| #115–117 | enhancement | — | enh | ✗ Colibri | defer | Next capability |
| #1/#25/#26 | enhancement | SP-065/066 Partial | epic | ✗ hardware | defer | Physical access |

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: minor (matches Phase 2)
- [ ] `npm version minor` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches target
