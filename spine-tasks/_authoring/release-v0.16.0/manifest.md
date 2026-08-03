# Release manifest — v0.16.0

**Created:** 2026-08-03
**Current version:** 0.15.0
**Target version:** v0.16.0
**Bump type:** minor
**Profile:** minor
**Theme:** ModernBERT K=4 heads training and Top-1 / offline A/B measurement to unblock #96 enablement evidence — ship or document `config/modernbert-k4-heads.json`, measure vs 10% gate beyond fixture QR, recommend keep / opt-in / flip without changing defaults.
**Operator approved scope:** yes (2026-08-03 — ModernBERT K=4 theme #114 → SP-218–SP-219)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | ModernBERT K=4 measurement (#114 → informs #96) | required | PASS |
| Documentation | 0 standalone (decision writeup inside SP-219) | theme docs OK | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 1 related (#114; soft parent #96 stays open) | minor 1–3 related | PASS |
| **Total tasks** | 2 (gaps → SP-218–SP-219) | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** n/a (minor)

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-218 | #114 | enh | M | Train / ship `modernbert-k4-heads.json` (or document operator-local) | Partial #114 — loadable via `DEFAULT_MODERNBERT_K4_HEADS_PATH` |
| SP-219 | #114 | enh | M | Top-1 / shortfall + offline A/B + #96 recommendation writeup | Closes #114; Partial #96 — **no** default flip |

**Release scope ID:** `SP-218,SP-219`

**Human QA (not in scope):** #95 shadow dogfood remains human-gated. #110 stays open until real exports. #96 remains open for operator enablement approve. #1/#25/#26 hardware dogfood deferred.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-218 SP-219
spine plan SP-218,SP-219
spine run sequence SP-218,SP-219 --dry-run
```

**Wave order (expected after packets land):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | SP-218 | Heads artifact first (real data dep) |
| 1 | SP-219 | Measurement + writeup after heads loadable |

```bash
spine batch start SP-218,SP-219 --wave N
# land: spine gate approve && spine integrate && npm install && spine batch complete
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${N}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (scope + theme) — **yes 2026-08-03**
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #114 (heads artifact) | enh | SP-218 | create-spine-tasks (lean) |
| #114 (Top-1 / A/B / writeup) | enh | SP-219 | create-spine-tasks (lean); depends SP-218 |

All packets are **gaps** — `spine plan pending` is empty (216 `.DONE`); Next Task ID = SP-218.

---

## Wave plan snapshot

```text
Spine plan — ids
2 task(s) · 2 wave(s) · maxParallel 3

Wave 0 · 1 task
  Lane 1: SP-218 — Train / Ship ModernBERT K=4 Heads Artifact

Wave 1 · 1 task
  Lane 1: SP-219 — K=4 Top-1 + Offline A/B + Enablement Writeup

Deps: SP-219 → SP-218
```

Start: `spine batch start SP-218,SP-219 --wave 0`
Then (after wave 0 lands): `spine batch start SP-218,SP-219 --wave 1`

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #96 | decision tracker | Soft parent — remains open until operator approves any default flip |
| #95 | human QA | Shadow dogfood; needs live sessions/exports |
| #110 | enh | Behavioral calibration blocked on #95 exports |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- No checked-in train script for K=4 heads today — SP-218 may need a thin train/export path from label packs / privacy-safe features, or an explicit operator-local provenance doc if floors unmet (no invented weights).
- Hot-file serialization: prefer SP-218 owns `config/modernbert-k4-heads.json` + train script; SP-219 owns measurement artifact + counterfactual-replay extensions — avoid parallel edits to `modernbert-heads.ts` / `counterfactual-replay.ts` across waves (serial anyway).
- Do **not** flip `src/config/defaults.ts` (`modernbert_k4`) or absolute `config/release-gates.json`.
- Soft ECE PASS on packs does **not** by itself warrant K=4 — Top-1 gate must be measured (#114 AC).
- Prior fixture QR (SP-160) alone is insufficient — SP-219 must use verifier-grade packs or a documented proxy beyond fixtures.

---

## Intake table (Phase 1)

| Issue # | Labels | Mapped SP-* | Bucket | Theme fit | Profile fit | Notes |
|---------|--------|-------------|--------|-----------|-------------|-------|
| #114 | enhancement | — (gap → SP-218/219) | enh | ✓ K=4 measure | minor ✓ | Operator-selected theme |
| #96 | enhancement | SP-204 Partial | decision | soft parent | defer close | Inform only; no flip |
| #95 | enhancement | SP-196 Partial | human QA | adjacent | defer | Human sessions |
| #110 | enhancement | SP-205 DONE / SP-206 External | enh | adjacent | defer | Needs #95 |
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
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches 0.16.0
