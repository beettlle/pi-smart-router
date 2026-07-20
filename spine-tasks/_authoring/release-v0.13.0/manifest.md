# Release manifest — v0.13.0

**Created:** 2026-07-19
**Current version:** 0.12.2
**Target version:** v0.13.0
**Bump type:** minor
**Profile:** minor
**Theme:** Multi-fleet dogfood routing correctness — honor force/prefer model ids across Copilot/Gemini fleets, break stuck economical pins on hard agentic failure, and ground capability aliases/coverage for common multi-provider dogfood ids.
**Operator approved scope:** yes (2026-07-19 — full SP-208–SP-211)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Multi-fleet dogfood routing correctness | required | PASS |
| Documentation | 1 (#124 coverage + shadow-dogfood link) | theme docs OK | PASS |
| Bug fixes | 2 (#121, #122) | soft | PASS |
| Enhancements | 2 related (#124 mapper/aliases + #123 local_zero preference) | minor 1–3 related | PASS |
| **Total tasks** | 4 | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none (minor)

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-208 | #124 | doc/enh | M | Capability aliases + Copilot/Gemini/Anthropic coverage | Closes #124; follow-on #108 |
| SP-209 | #121 | bug | M | Honor `force_model_id` / prefer — no silent provider remap | Closes #121 |
| SP-210 | #122 | bug | M | Break/upgrade economical pin on hard agentic failure | Closes #122 |
| SP-211 | #123 | enh | M | Prefer healthy `local_zero` on trivial/no-tool turns | Closes #123; inverse of closed #97 |

**Release scope ID:** `SP-208,SP-209,SP-210,SP-211`

**Human QA (not in scope):** #95 shadow dogfood remains human-gated; do not close from packets. #110 stays open until real exports exist (v0.12.0 Partial B).

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-208 SP-209 SP-210 SP-211
spine plan SP-208,SP-209,SP-210,SP-211
spine run sequence SP-208,SP-209,SP-210,SP-211 --dry-run
```

**Wave order (proposed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 1 | SP-208 | Docs + mapper/coverage — disjoint from pin/pipeline hot paths |
| 2 | SP-209, SP-210 | Serialize `router-pipeline.ts` / pin hot files — run sequential if both touch shared paths |
| 3 | SP-211 | local_zero / expected-cost after force + pin behavior stable |

```bash
spine batch start SP-208,SP-209,SP-210,SP-211 --wave N
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
| #124 | doc/enh | SP-208 | create-spine-tasks (lean) |
| #121 | bug | SP-209 | create-spine-tasks (lean) |
| #122 | bug | SP-210 | create-spine-tasks (lean) |
| #123 | enh | SP-211 | create-spine-tasks (lean) |

All packets are **gaps** — `spine plan pending` is empty (206 `.DONE`); Next Task ID = SP-208.

---

## Wave plan snapshot

```text
Wave 1: SP-208, SP-210 (parallel — disjoint File Scope)
Wave 2: SP-209 (depends SP-208)
Wave 3: SP-211 (depends SP-209)
Deps: SP-209→SP-208; SP-211→SP-209; SP-210 none
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #95 | human QA | Shadow dogfood protocol exists; needs live sessions/exports — not packet-closable |
| #110 | enh | Behavioral calibration ship blocked on #95 exports (v0.12.0 Partial B) |
| #96 / #114 | enh | Encoder enablement / Top-1 gate — separate encoder theme |
| #115 / #116 / #117 | enh | Colibri heat-map / plan-doctor / prewarm — next-capability theme |
| #119 / #120 | enh | Neural failover sandwich + planning_delegate timeouts — reliability theme |
| #125 | enh | Live quota window feed for virtual cost v2 — economics theme |
| #1 / #25 / #26 | epic | Hardware probe — blocked on physical access |

---

## Risks and blockers

- Hot-file serialization: `.pi/extensions/smart-router/index.ts`, `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/session-pinner.ts`, `src/config/pi-model-mapper.ts` — do not parallel-edit shared paths in one wave.
- Do **not** flip encoder defaults (`modernbert_k4`) or absolute `config/release-gates.json` in this release.
- #121/#124 both touch mapper/aliases — Wave 1 then Wave 2 order reduces thrash; merge carefully if both edit `pi-model-mapper.ts`.
- No pending tasks today — Phase 3 must author all four packets before any batch.

---

## Intake table (Phase 1)

| Issue # | Labels | Mapped SP-* | Bucket | Theme fit | Profile fit | Notes |
|---------|--------|-------------|--------|-----------|-------------|-------|
| #124 | documentation, enhancement | — (gap → SP-208) | doc/enh | ✓ | minor ✓ | Follow-on #108 |
| #121 | bug | — (gap → SP-209) | bug | ✓ | minor ✓ | Force/prefer remap |
| #122 | bug | — (gap → SP-210) | bug | ✓ | minor ✓ | Economical pin stuck |
| #123 | enhancement | — (gap → SP-211) | enh | ✓ | minor ✓ | local_zero preference |
| #95 | enhancement | SP-196 Partial | human QA | adjacent | defer | Human sessions |
| #110 | enhancement | SP-205/206 Partial | enh | adjacent | defer | Needs #95 exports |
| #96/#114 | enhancement | — | enh | ✗ encoder | defer | Separate theme |
| #115–117 | enhancement | — | enh | ✗ Colibri | defer | Next capability |
| #119/#120 | enhancement | — | enh | ✗ failover/timeouts | defer | Reliability theme |
| #125 | enhancement | — | enh | ✗ quota feed | defer | Economics |
| #1/#25/#26 | enhancement | SP-065/066 Partial | epic | ✗ hardware | defer | Physical access |

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **minor** (matches Phase 2)
- [ ] `npm version minor` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches `0.13.0`
