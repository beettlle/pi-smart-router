# Release manifest — v0.16.2

**Created:** 2026-08-22
**Current version:** 0.16.1
**Target version:** v0.16.2
**Bump type:** patch
**Profile:** patch
**Theme:** Stop smart-router self-recursion and detect tool failures via structured host signals instead of naive body substring matching.
**Operator approved scope:** yes (2026-08-22 — land PR #126/#127 review fixes as SP-221/SP-222)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Self-recursion guard + structured loop-escalation failures | required | PASS |
| Documentation | 0 | patch 0–2 | PASS |
| Bug fixes | 2 (#131, #132) | soft 1–5 | PASS |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 2 | patch ≤8 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-221 | #131 / PR #126 | bug | S | Exclude smart-router/auto from delegation fleet | Closes #131; review: regression tests |
| SP-222 | #132 / PR #127 | bug | M | Loop-escalation structured failure signals | Closes #132; review: contract sync, producer, trust signal |

**Release scope ID:** `SP-221,SP-222`

---

## Wave plan snapshot

```text
Wave 0 · 2 tasks (disjoint scopes)
  Lane 1: SP-221 — fleet-bootstrap + pi-router-middleware + pricing/extension tests
  Lane 2: SP-222 — loop-escalation + entities/schemas/contract + mapContextMessages + tests
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #110 | enh | Patch forbids enhancements |
| #96 / #95 | enh / human QA | Enablement / dogfood — not patch |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- SP-221 and SP-222 touch disjoint files — safe parallel wave 0.
- Close community PRs #126/#127 after merge with attribution note in release report.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green
- [ ] CI green on `HEAD`
- [ ] Operator approved publish bump type: **patch**
- [ ] `npm version patch` + `git push && git push --tags`
