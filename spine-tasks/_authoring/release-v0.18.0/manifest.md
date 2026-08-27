# Release manifest — v0.18.0

**Created:** 2026-08-27
**Current version:** 0.17.0
**Target version:** v0.18.0
**Bump type:** minor
**Profile:** minor
**Theme:** Dogfood resilience — Gemini thought_signature recovery after cross-provider tool history, plus non-blocking SQLite writes on the routing hot path.
**Operator approved scope:** yes (2026-08-27) — include #158, #159, and #142

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Dogfood resilience (Gemini + SQLite) | required | PASS |
| Documentation | 0 standalone (README in #158/#159 packets; StorePort docs in #142) | theme docs OK | PASS |
| Bug fixes | 1 (#158) | soft; open P0 included | PASS |
| Enhancements | 2 related clusters (#159 + #142) | minor 1–3 | PASS (operator chose #142 add-on; theme broadened) |
| **Total tasks** | 6 | minor ≤15 | PASS |

**Profile audit:** PASS with operator override (theme coherence — persistence #142 added beside Gemini cluster at operator request)

**Hygiene (patch only, if any):** none

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-231 | #158 | bug | M | Broaden repairGeminiReplayContext for non-Google toolCalls | Partial #158 (phase 1) |
| SP-232 | #158 | bug | M | Expand tool-history guard + README for cross-provider Gemini | Closes #158 |
| SP-233 | #159 | enh | M | One-shot non-Google protocol-affinity failover on thought_signature 400 | Closes #159 |
| SP-234 | #142 | enh | M | Audit hot-path StorePort writes + bounded write-queue design | Partial #142 (phase 1) |
| SP-235 | #142 | enh | M | Implement bounded async write queue for pins/telemetry | Partial #142 (phase 2) |
| SP-236 | #142 | enh | S | Remove fire-and-forget SQLite writes + benchmark + StorePort docs | Closes #142 |

**Release scope ID:** `SP-231,SP-232,SP-233,SP-234,SP-235,SP-236`

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-231 SP-232 SP-233 SP-234 SP-235 SP-236
spine plan SP-231,SP-232,SP-233,SP-234,SP-235,SP-236
spine run sequence SP-231,SP-232,SP-233,SP-234,SP-235,SP-236 --dry-run
spine run sequence SP-231,SP-232,SP-233,SP-234,SP-235,SP-236
```

Per-wave manual loop (alternative):

```bash
spine batch start SP-231,SP-232,SP-233,SP-234,SP-235,SP-236 --wave N
spine status --diagnose
spine gate approve && spine integrate && npm install && spine batch complete
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

---

## Gaps requiring new packets

All six tasks are **gaps** — no existing SP-* maps to #158, #159, or #142. Author in Phase 3. Proposed IDs SP-231–SP-236 (Next Task ID was SP-231).

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #158 (phase 1) | bug | SP-231 | create-spine-tasks (lean) |
| #158 (phase 2) | bug | SP-232 | create-spine-tasks (lean) |
| #159 | enh | SP-233 | create-spine-tasks (lean) |
| #142 (phase 1) | enh | SP-234 | create-spine-tasks (lean) |
| #142 (phase 2) | enh | SP-235 | create-spine-tasks (lean) |
| #142 (phase 3) | enh | SP-236 | create-spine-tasks (lean) |

Serialize: Gemini chain SP-231→232→233 (README + guard/failover). SQLite chain SP-234→235→236 (`sqlite-store.ts` / `session-pinner.ts`). Clusters may run in parallel across waves when File Scope is disjoint.

---

## Wave plan snapshot

```text
Spine plan — ids
6 task(s) · 3 wave(s) · maxParallel 3

Wave 0 · 2 tasks · 2 lanes in parallel
  Lane 1: SP-231 — Broaden Gemini replay repair for non-Google toolCalls
  Lane 2: SP-234 — Audit hot-path StorePort writes + bounded write-queue design

Wave 1 · 2 tasks · 2 lanes in parallel
  Lane 1: SP-232 — Expand Gemini tool-history guard + README
  Lane 2: SP-235 — Implement bounded async write queue for pins/telemetry

Wave 2 · 2 tasks · 2 lanes in parallel
  Lane 1: SP-233 — One-shot non-Google failover on Gemini thought_signature 400
  Lane 2: SP-236 — Remove fire-and-forget SQLite writes + benchmark + StorePort docs
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #145 | enh | Session teardown — not selected; operator chose #142 only |
| #148 | enh | Degraded HyDRA/K4 — not selected |
| #143 | enh (L) | RouterPipeline god-object split — multi-wave epic; defer to v0.19 |
| #144 | enh | Extension Vitest coverage gate — next minor |
| #146–#147, #149 | enh | Sibling P1 tech debt — outside this theme |
| #150–#155 | enh/doc (P2) | C-tier hygiene |
| #153 | doc | Library vs extension parity — defer |
| #156–#157 | chore (P3) | D-tier hygiene |
| #95, #110, #96 | enh | Dogfood/calibration/enablement — human QA gates |
| #1, #25, #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- SP-231/SP-232/SP-233 share Gemini repair/guard/delegation paths and README — keep serial via deps.
- SP-234/SP-235/SP-236 share `sqlite-store.ts` and `session-pinner.ts` — keep serial via deps.
- #159 amends #37 UX (terminal → one-shot protocol-affinity); keep infra/circuit-breaker classification unchanged.
- #142 queue design must document latency tradeoff; benchmark required before close (SP-236).

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
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches 0.18.0
