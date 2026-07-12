# Release manifest — v0.12.0

**Created:** 2026-07-12
**Current version:** 0.11.0
**Target version:** v0.12.0
**Bump type:** minor
**Profile:** minor
**Theme:** Live shadow dogfood (#95) + behavioral P(success)/isotonic calibration from real exports (#110)
**Operator approved scope:** yes (2026-07-12)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Live shadow dogfood + behavioral calibration from real exports | required | PASS |
| Documentation | 1 (SP-205 — theme docs inside #110) | theme docs OK | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 1 issue (#110 → SP-205 + SP-206) | minor 1–3 related | PASS |
| **Total tasks** | 2 | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none (minor)

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-205 | #110 | doc/enh | S | Behavioral calibration docs (zero-manual-label bootstrap) | Partial #110 docs AC; can land during human dogfood |
| SP-206 | #110 | enh | M | Aggregate/train/ship from dogfood exports | Closes #110 when ≥30 labeled economical rows; External: #95 exports |

**Release scope ID:** `SP-205,SP-206`

**Human QA gate (not a spine task):** #95 live shadow dogfood — follow `docs/qa/shadow-dogfood-protocol.md`, then post sign-off on the issue. Do **not** close #95 from SP packets alone.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-205 SP-206
spine plan SP-205,SP-206
spine run sequence SP-205,SP-206 --dry-run
```

**Wave order:**

| Wave | Tasks | When |
|------|-------|------|
| 1 | SP-205 | Now / parallel with human #95 sessions |
| 2 | SP-206 | **Only after** operator archives #95 dataset + telemetry-contrib exports and confirms path + row counts |

```bash
# Wave 1
spine batch start SP-205 --wave 1
# … land → release:check …

# Wave 2 (after exports ready)
spine batch start SP-205,SP-206 --wave 2
# or: spine batch start SP-206 --wave 1   if SP-205 already .DONE
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Manifest scope — approved 2026-07-12
2. Human #95 dogfood window + export paths before Wave 2
3. `spine gate approve` per integrate wave
4. Publish approval before `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #110 (docs AC) | doc | SP-205 | create-spine-tasks (lean) |
| #110 (train/ship) | enh | SP-206 | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
Wave 1: SP-205 (docs)
Wave 2: SP-206 (after External #95 exports)
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #96 | enh | Encoder enablement decision — blocked on #114 Top-1; out of dogfood theme |
| #114 | enh | modernbert-k4 heads + Top-1 — encoder path, not live dogfood |
| #1 / #25 / #26 | epic | Hardware probe — blocked on physical access |

---

## Risks and blockers

- **SP-206 External:** needs privacy-safe dogfood exports from #95 with ≥30 labeled economical-tier rows (passive signals preferred). If floor not met → Partial #110 with writeup; **never invent labels** or ship synthetic as “behavioral.”
- TwinRouterBench soft over-routing (~0.85) remains soft-feed — do not harden into `release:functional-smoke`.
- Do not edit absolute `config/release-gates.json` or flip encoder defaults in this release.

---

## Human #95 checklist (release gate)

- [ ] Session matrix (≥5 sessions / rows) **or** ≥30 labeled economical-tier dataset rows
- [ ] `SMART_ROUTER_DATASET=1`; dataset + telemetry-contrib exports archived
- [ ] Privacy check: no prompt text
- [ ] `npm run qa:shadow-dogfood` archived under `.pi-smart-router/qa-runs/`
- [ ] Sign-off form posted on #95 (go / no-go / needs more data)
- [ ] No frugality / absolute-gate / encoder-default flips without separate approval

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main` (or SP-206 Partial documented + operator accepts defer)
- [ ] Post-integrate `release:check` green after **each wave**
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] #95 sign-off posted (close only if AC met)
- [ ] Operator approved publish bump type: **minor**
- [ ] `npm version minor` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches `0.12.0`
