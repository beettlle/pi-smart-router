# Release manifest — v0.15.0

**Created:** 2026-08-02
**Current version:** 0.14.0
**Target version:** v0.15.0
**Bump type:** minor
**Profile:** minor
**Theme:** Colibri-inspired local affinity & placement — privacy-safe workload heat soft-bias with pin-boundary hysteresis, honest local placement plan/doctor with cold vs warm TPS, and optional speculative local/encoder prewarm with an acceptance guard (default off).
**Operator approved scope:** yes (2026-08-02 — Colibri theme #115+#116+#117 → SP-215–SP-217)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Colibri-inspired local affinity & placement | required | PASS |
| Documentation | 0 standalone (operator docs land inside enhancement packets) | theme docs OK | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 3 related (#115, #116, #117) | minor 1–3 related | PASS |
| **Total tasks** | 3 (gaps → SP-215–SP-217) | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** n/a (minor)

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-215 | #115 | enh | M | Workload heat map + soft fleet affinity + hysteresis | Closes #115 |
| SP-216 | #116 | enh | M | Honest local placement plan/doctor + cold vs warm TPS | Closes #116 |
| SP-217 | #117 | enh | M | Speculative local/encoder prewarm with acceptance guard | Closes #117 |

**Release scope ID:** `SP-215,SP-216,SP-217`

**Human QA (not in scope):** #95 shadow dogfood remains human-gated. #110 stays open until real exports. #96/#114 encoder enablement deferred. #1/#25/#26 hardware dogfood deferred.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-215 SP-216 SP-217
spine plan SP-215,SP-216,SP-217
spine run sequence SP-215,SP-216,SP-217 --dry-run
```

**Wave order (from `spine plan` after packets land):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | SP-215, SP-216, SP-217 | Prefer 3 parallel lanes — disjoint File Scope (heat/expected-cost+pinning · hardware+commands · prewarm+pipeline) |

```bash
spine batch start SP-215,SP-216,SP-217 --wave N
# land: spine gate approve && spine integrate && npm install && spine batch complete
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${N}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (scope + theme) — **yes 2026-08-02**
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #115 | enh | SP-215 | create-spine-tasks (lean) |
| #116 | enh | SP-216 | create-spine-tasks (lean) |
| #117 | enh | SP-217 | create-spine-tasks (lean) |

All packets are **gaps** — `spine plan pending` is empty (213 `.DONE`); Next Task ID was SP-215.

---

## Wave plan snapshot

```text
Spine plan — ids
3 task(s) · 1 wave(s) · maxParallel 3

Wave 0 · 3 tasks · 3 lanes in parallel
  Lane 1: SP-215 — Workload Heat Map + Soft Fleet Affinity
  Lane 2: SP-216 — Local Placement Plan / Doctor + Cold vs Warm TPS
  Lane 3: SP-217 — Speculative Prewarm with Acceptance Guard

Deps: none (all independent)
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #95 | human QA | Shadow dogfood; needs live sessions/exports |
| #110 | enh | Behavioral calibration blocked on #95 exports; SP-206 External |
| #96 / #114 | enh | Encoder enablement / Top-1 — separate theme |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- Hot-file serialization: do not parallel-edit `router-pipeline.ts` across tasks — only SP-217 owns pipeline; SP-215 wires soft-bias via `expected-cost` + pinning modules.
- Shared docs collapse lanes — SP-216 owns README; SP-215 uses dogfood protocol pointer; SP-217 uses explain/telemetry docs in code + roadmap Check If Affected only.
- Do **not** flip encoder defaults (`modernbert_k4`) or absolute `config/release-gates.json`.
- Heat records must never store raw prompt text (privacy).
- Prewarm default **off**; fail open on timeout / low acceptance.

---

## Intake table (Phase 1)

| Issue # | Labels | Mapped SP-* | Bucket | Theme fit | Profile fit | Notes |
|---------|--------|-------------|--------|-----------|-------------|-------|
| #115 | enhancement | — (gap → SP-215) | enh | ✓ heat affinity | minor ✓ | Colibri learning cache |
| #116 | enhancement | — (gap → SP-216) | enh | ✓ plan/doctor | minor ✓ | Colibri plan/doctor |
| #117 | enhancement | — (gap → SP-217) | enh | ✓ prewarm guard | minor ✓ | Colibri PILOT pattern |
| #95 | enhancement | SP-196 Partial | human QA | adjacent | defer | Human sessions |
| #110 | enhancement | SP-205 DONE / SP-206 External | enh | adjacent | defer | Needs #95 |
| #96/#114 | enhancement | — | enh | ✗ encoder | defer | Separate theme |
| #1/#25/#26 | enhancement | SP-065/066 Partial | epic | ✗ hardware | defer | Physical access |

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: minor (matches Phase 2)
- [ ] `npm version minor` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches 0.15.0
