# Release manifest — v0.16.1

**Created:** 2026-08-20
**Current version:** 0.16.0
**Target version:** v0.16.1
**Bump type:** patch
**Profile:** patch
**Theme:** First-run SQLite store correctness plus community fixes for GPT-5.6+ frontier mapping and `smart-router/auto` context-window sync (footer/compaction).
**Operator approved scope:** yes (2026-08-20 — patch #130+#133+#134; merge PRs #128/#129; SP-220 for #130)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | First-run store + mapper + auto context-window correctness | required | PASS |
| Documentation | 0 | patch 0–2 | PASS |
| Bug fixes | 3 (#130, #133, #134) | soft 1–5 | PASS |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 1 spine (SP-220) + 2 PR merges | patch ≤8 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none beyond the three user-visible bugfixes

---

## Selected work

| ID | Issue | Bucket | Size | Title | Land path | Notes |
|----|-------|--------|------|-------|-----------|-------|
| PR #128 | #133 | bug | S | Classify gpt-5.5+ (5.6/5.7/…) as frontier-cloud | Merge community PR | Author `cokkyturnip`; owner APPROVED; MERGEABLE |
| PR #129 | #134 | bug | M | Sync `auto` context window from delegated model | Merge community PR | Author `cokkyturnip`; owner APPROVED; MERGEABLE; includes outcome-fixture retention hygiene |
| SP-220 | #130 | bug | S | Create missing `.pi-smart-router` parent dir (no corrupt-DB theater) | Author + spine batch | **Gap** — no PR; Next Task ID SP-220 |

**Release scope ID (spine):** `SP-220`

**PR land order (before or with SP-220 wave):** merge `#128` then `#129` (disjoint files: mapper vs extension). Re-run `npm run release:check` after merges and after SP-220 integrate.

---

## Sequence runner (Phase 4)

```bash
# Community PRs (operator-approved land path)
gh pr merge 128 --merge
gh pr merge 129 --merge
git pull origin main
npm install
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-merge-prs-v0161.log
test "${PIPESTATUS[0]}" -eq 0

# Spine gap for #130
spine tasks validate SP-220
spine plan SP-220
spine run sequence SP-220 --dry-run
spine batch start SP-220 --wave 0
# land: spine gate approve && spine integrate && npm install && spine batch complete
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-0.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (scope + theme) — **awaiting**
2. `spine gate approve` for SP-220 integrate
3. Publish approval before `npm version patch`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #130 | bug | SP-220 | create-spine-tasks (lean) + packet-from-issue |

---

## Wave plan snapshot

```text
(pre-spine) Merge PR #128 (#133), PR #129 (#134) → release:check
Spine plan — SP-220
1 task(s) · 1 wave(s)

Wave 0 · 1 task
  Lane 1: SP-220 — First-run mkdir for sqlite parent dir (#130)
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #131 / PR #126 | bug | Outside approved scope; CHANGES_REQUESTED on PR |
| #132 / PR #127 | bug | Outside approved scope; CHANGES_REQUESTED on PR |
| #110 | enh | Patch forbids enhancements |
| #96 / #95 | enh / human QA | Enablement / dogfood — not patch |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- PRs #128/#129 show only GitGuardian green locally in rollup (`mergeStateStatus: UNSTABLE`) — require full CI green on `main` HEAD after merge before tag.
- PR #129 touches extension hot paths (`delegate-stream`, `session-lifecycle`, `extension-setup`) — serialize vs any future extension work; SP-220 stays on `sqlite-store.ts` (disjoint).
- Do not merge #126/#127 in this release without re-opening scope (CHANGES_REQUESTED).

---

## Publish checklist (Phase 5–6)

- [x] PR #128 and #129 merged; #133/#134 closed
- [x] SP-220 `.DONE` on `main` (manual land after final-review timeout; batch 20260820T174253 aborted)
- [x] Post-merge `release:check` green (offline skip live refresh; EXIT=0)
- [x] Final `spine preflight` green
- [x] Final `npm run release:check` green on publish HEAD (`/tmp/pi-smart-router-release-check-v0161-final.log`)
- [x] CI workflow green on `HEAD` (https://github.com/beettlle/pi-smart-router/actions/runs/32415296090)
- [x] `git status` clean
- [x] Operator approved publish bump type: **patch** (2026-08-20)
- [x] `npm version patch` + `git push && git push --tags` → `v0.16.1` / `d37e579`
- [x] `release.yml` succeeded (https://github.com/beettlle/pi-smart-router/actions/runs/32415527512); verify `npm view pi-smart-router version` = 0.16.1

## Land notes

- Community PRs merged 2026-08-20: #128 → #133, #129 → #134
- SP-220 worker completed in lane (mkdir + 12/12 tests); spine final review timed out; salvage `lane_not_salvageable`
- Manual land: abort batch → cherry-pick `b0a2597`/`0728705` → commit `.DONE` → close #130
