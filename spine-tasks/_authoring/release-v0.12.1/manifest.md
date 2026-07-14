# Release manifest — v0.12.1

**Created:** 2026-07-13
**Current version:** 0.12.0
**Target version:** v0.12.1
**Bump type:** patch
**Profile:** patch
**Theme:** Dogfood operator UX hygiene — read-only session stats / role cost ledger (#118)
**Operator approved scope:** yes (2026-07-13 — patch override for #118 ops hygiene)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Read-only `/smart-router stats` + role cost breakdown for #95 dogfood | required | PASS |
| Documentation | theme docs inside SP-207 | patch clarifications OK | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 1 (#118) | patch **0** (hard) | **PASS with operator override** — see below |
| **Total tasks** | 1 | patch ≤8 | PASS |

**Profile audit:** PASS with operator override (2026-07-13)

### Operator override (patch + #118)

Release-profile rule normally **hard-fails** enhancements in patch and forbids OVERRIDE for feature-in-patch. Operator explicitly chose:

> Override patch profile for #118 ops hygiene

**Justification (one line):** #118 is a **read-only** operator surface over existing `listTelemetry` data (llm-use `stats_snapshot` analog) — **zero routing / pin / gate / default changes** — needed before #95 dogfood so exports are eyeballable. Not a routing capability.

**Still deferred as enhancements (no override):** #115 heat affinity, #116 plan/doctor, #117 prewarm, #119 degraded sandwich, #120 delegate timeouts, #96/#114, hardware.

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-207 | #118 | ops hygiene (override) | M | Session stats + role cost breakdown | Closes #118 when landed |

**Release scope ID:** `SP-207`

**Human QA (unchanged):** After SP-207 integrates + `release:check`, start #95 live shadow dogfood on that build (`docs/qa/shadow-dogfood-protocol.md`). Do not start #115–#117/#119–#120 before baseline dogfood.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-207
spine plan SP-207
spine run sequence SP-207 --dry-run
spine batch start SP-207 --wave 0
```

**Wave order:** single wave (SP-207 only).

**Regression gate** (after integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-v0121.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Manifest scope — approved 2026-07-13 (patch override)
2. `spine gate approve` before integrate
3. Publish approval before `npm version patch`

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #95 | human QA | Start after SP-207 lands (dogfood window) |
| #110 | enh | Partial on v0.12.0; waits on #95 exports |
| #115–#117 | enh | Contaminate baseline if before dogfood |
| #119–#120 | enh | Post-dogfood; failover/timeouts not for baseline |
| #96 / #114 | enh | Encoder path |
| #1 / #25 / #26 | epic | Hardware |

---

## Risks and blockers

- Must **not** change routing decisions, frugality, absolute gates, or encoder defaults.
- Stats must never echo prompt/message bodies (privacy).
- Optional frontier-savings estimate fails closed when prices missing.

---

## Publish checklist (Phase 5–6)

- [x] SP-207 `.DONE` on `main`
- [x] Post-integrate `release:check` green (`/tmp/pi-smart-router-post-integrate-v0121.log`; functional-smoke EXIT:0 after gate commit `2d7e825`)
- [x] `spine preflight` green
- [x] Clean git tree (`main` pushed to `origin` at `2d7e825`)
- [x] Operator approved publish bump type: **patch** (2026-07-13)
- [x] `npm version patch` + `git push && git push --tags` (`266b970` / `v0.12.1`)
- [x] `release.yml` succeeded; npm `0.12.1` (https://github.com/beettlle/pi-smart-router/actions/runs/29299243890)
