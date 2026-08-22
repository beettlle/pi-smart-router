# Release manifest — v0.17.0

**Created:** 2026-08-22
**Current version:** 0.16.2
**Target version:** v0.17.0
**Bump type:** minor
**Profile:** minor
**Theme:** 0.17 production safety — extension fail-open, SP-222 producer completion, CI trust on routing code changes, and live contract/schema alignment.
**Operator approved scope:** yes (2026-08-22)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Production safety (audit A-tier P0) | required | PASS |
| Documentation | 1 (#152) | theme docs | PASS |
| Bug fixes | 4 (#137–#140) | soft; 0 OK | PASS |
| Enhancements | 2 (#135, #136) | minor 1–3 related | PASS |
| **Total tasks** | 8 | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-223 | #138 | bug | S | Gate expected-cost explain logging behind SMART_ROUTER_LOG_ROUTING | Closes #138 |
| SP-224 | #139 | bug | S | Stabilize SC-004 triage p95 latency test | Closes #139 |
| SP-225 | #137 | bug | M | Finish SP-222 producer: map Pi status/tool metadata | Closes #137; follow-on #132 |
| SP-226 | #140 | bug | M | route-and-delegate fail-open when fleet exhausted | Closes #140 |
| SP-227 | #152 | doc | M | Reconcile operator config and docs with 0.16.2 runtime | Closes #152 |
| SP-228 | #135 | enh | M | CI quality gates on src and extension changes | Closes #135 |
| SP-229 | #136 | enh | M | Sync RoutingDecision/RoutingRequest contracts with live pipeline | Closes #136 |
| SP-230 | #141 | enh | M | Validate RouterPipeline concurrent route() safety | Closes #141 |

**Release scope ID:** `SP-223,SP-224,SP-225,SP-226,SP-227,SP-228,SP-229,SP-230`

---

## Gaps requiring new packets

All eight tasks are **gaps** — no existing SP-* maps to audit issues #135–#141, #152. Author in Phase 3 with `create-spine-tasks` (lean) + `packet-from-issue.md`. Proposed IDs SP-223–SP-230 (Next Task ID SP-223 per CONTEXT.md).

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #138 | bug | SP-223 | create-spine-tasks (lean) |
| #139 | bug | SP-224 | create-spine-tasks (lean) |
| #137 | bug | SP-225 | create-spine-tasks (lean) |
| #140 | bug | SP-226 | create-spine-tasks (lean) |
| #152 | doc | SP-227 | create-spine-tasks (lean) |
| #135 | enh | SP-228 | create-spine-tasks (lean) |
| #136 | enh | SP-229 | create-spine-tasks (lean) |
| #141 | enh | SP-230 | create-spine-tasks (lean) |

Serialize hot files: `.pi/extensions/smart-router/route-and-delegate.ts`, `routing-context.ts`, `src/domain/pipeline/router-pipeline.ts`, `specs/001-build-smart-router/contracts/`.

---

## Wave plan snapshot

```text
Wave 0 · 3 tasks (disjoint — quick wins)
  SP-223 — expected-cost log gate (router-pipeline.ts)
  SP-224 — SC-004 test stabilization (triage-engine.test.ts)
  SP-227 — docs + operator-config.example validation

Wave 1 · 2 tasks (extension hot path — serialize if same lane)
  SP-225 — mapContextMessages producer (#137)
  SP-226 — route-and-delegate fail-open (#140)

Wave 2 · 2 tasks (CI + contracts — disjoint from wave 1)
  SP-228 — workflow path filters (#135)
  SP-229 — schema/Zod/contract round-trip (#136)

Wave 3 · 1 task (pipeline concurrency)
  SP-230 — RouterPipeline concurrent route() safety (#141)
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #142 | enh (L) | SQLite sync blocking — L-sized; split before inclusion |
| #143–#149 | enh (P1) | B-tier tech debt — defer to v0.18 theme “extension & pipeline hygiene” |
| #150–#155 | enh/doc (P2) | C-tier — capacity after P0 ship |
| #156–#157 | chore (P3) | D-tier hygiene — not release-blocking |
| #153 | doc | Extension parity docs — defer; #152 supersedes urgent drift |
| #95, #110, #96 | enh | Dogfood/calibration/enablement — human QA or separate minor |
| #1, #25, #26 | epic | Hardware — blocked on physical access |
| SP-221, SP-222 | stale pending | Landed in v0.16.2 — close via #156 hygiene or manifest cleanup |

---

## Risks and blockers

- SP-225 and SP-226 share extension hot path — prefer serial lane or disjoint file scopes.
- SP-229 depends on SP-225 message-field alignment — schedule SP-225 before or in same wave as SP-229.
- SP-228 may require human repo-settings approval for required checks (#135 AC).
- #142 (SQLite blocking) intentionally deferred — do not sneak in as patch hygiene.
- Working tree has uncommitted audit-v017 authoring — commit or stash before Phase 3 packet commit.

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
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches 0.17.0
