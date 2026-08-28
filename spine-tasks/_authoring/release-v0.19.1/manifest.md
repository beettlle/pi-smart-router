# Release manifest — v0.19.1

**Created:** 2026-08-28
**Current version:** 0.19.0 (accidental empty bump; npm `latest` = 0.18.0)
**Target version:** v0.19.1
**Bump type:** patch
**Profile:** patch
**Theme:** Documentation parity clarification — make the library (`createRouter()`) vs pi extension feature gap explicit for embedders.
**Operator approved scope:** yes (2026-08-28)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | "Documentation parity clarification" | required | PASS |
| Documentation | 1 (#153) | patch 0–2 | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 1 | patch ≤8 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none — #153 is `label:documentation`; no code changes, no new capability.

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-237 | #153 | doc | S | Document library vs extension feature parity gap | Closes #153 |

**Release scope ID:** `SP-237`

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-237
spine plan SP-237
spine run sequence SP-237 --dry-run
```

Per-wave manual loop (single wave, single task):

```bash
spine batch start SP-237 --wave 0
spine status --diagnose
spine gate approve && spine integrate && npm install && spine batch complete
```

**Regression gate** (after integrate, before publish):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-0.log
test "${PIPESTATUS[0]}" -eq 0
```

Do **not** use `| tail` alone for pass/fail — verify exit code.

**Operator gates** (human only):

1. ~~Approve this manifest~~ — approved 2026-08-28 (docs-only #153)
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version patch`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Status |
|-------|--------|----------------|--------|
| #153 | doc | SP-237 | authored 2026-08-28 |

---

## Wave plan snapshot

```text
Spine plan — ids
1 task(s) · 1 wave(s) · maxParallel 3

Wave 0 · 1 task
  Lane 1: SP-237 — Document library vs extension feature parity gap

Start: spine batch start SP-237
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #143, #144, #149 | enh P1 | Architecture/L-size — next minor after split |
| #145, #147, #148 | enh P1 | "Graceful degradation & session hygiene" minor candidate (v0.20.0 proposal) |
| #150, #151, #154, #155 | enh P2 | Packaging/infra hygiene — batch with next minor |
| #156, #157 | enh P3 | Process hygiene |
| #95 (P0), #110, #96 | enh | Human dogfood / behavioral calibration adoption — needs live dogfood volume |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- npm `0.19.0` is an accidental empty bump (npm `latest` = 0.18.0) — deprecate on npm during publish (operator to confirm / run with credentials).
- None code-level: docs-only scope, `fileScopeMustNotChange` guards `src/**` and `.pi/**`.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green (log path recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: patch (`npm version patch` → 0.19.1)
- [ ] `npm version patch` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` shows 0.19.1 as `latest`
- [ ] Deprecate stray npm `0.19.0` (optional, needs credentials)
