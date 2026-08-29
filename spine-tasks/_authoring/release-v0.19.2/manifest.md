# Release manifest — v0.19.2

**Created:** 2026-08-29
**Current version:** 0.19.1
**Target version:** v0.19.2
**Bump type:** patch
**Profile:** patch
**Theme:** Delegation stability hotfix — restore delegation to extension-registered custom-API providers (e.g. claude-bridge), which currently always fails with `No API provider registered`.
**Operator approved scope:** yes (2026-08-29 — "Run Option A — v0.19.2 patch")

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Delegation stability hotfix | required | PASS |
| Documentation | 0 | patch 0–2 | PASS (none open) |
| Bug fixes | 1 (#160) | soft 1–5; 0 OK if none open | PASS |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 1 | patch ≤8 | PASS |

**Profile audit:** PASS — single high-impact user-visible bug, S-sized surgical fix, zero enhancements, one wave.

**Hygiene (patch only, if any):** none

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-238 | #160 | bug | S | Delegate via composed provider so extension-registered custom-API providers stream | Closes #160 |

**Release scope ID:** SP-238

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-238
spine plan SP-238
spine run sequence SP-238 --dry-run
spine batch start SP-238 --wave 0   # detached — omit --attached
spine status --diagnose
spine gate approve && spine integrate && npm install && spine batch complete
```

**Regression gate** (after integrate, before push):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-0.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates** (human only):

1. ~~Approve this manifest~~ — approved 2026-08-29
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version patch`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #160 | bug | SP-238 | create-spine-tasks (lean) + packet-from-issue.md |

---

## Wave plan snapshot

Single task → single wave (wave 0), no parallelism, no hot-file contention.

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #95 | enh P0 | Shadow dogfood run — human runtime work, not patch scope |
| #110 | enh P1 | P(success) serve adoption — next minor |
| #143 | enh P1 | RouterPipeline split — large refactor, next minor |
| #144 | enh P1 | Vitest extension coverage gate — enhancement, patch=0 |
| #145 | enh P1 | Session teardown routing-state eviction — enhancement |
| #146 | enh P1 | HMAC-pepper telemetry hashes — enhancement |
| #147 | enh P1 | ONNX artifact pinning + embedder lifecycle — enhancement |
| #148 | enh P1 | Explicit degraded mode — enhancement |
| #149 | enh P1 | Extension public facade — likely XL; split first, next minor |
| #96 | enh P2 | modernbert_k4 default decision — eval-gated |
| #150 | enh P2 | Build-artifact hygiene — enhancement |
| #151 | enh P2 | SystemInfoPort probe tests — enhancement |
| #154 | enh P2 | Node engine EBADENGINE — enhancement (chore) |
| #155 | enh P2 | Fragment router-pipeline.test.ts — enhancement |
| #156, #157 | enh P3 | STATUS hygiene / ESLint flat config — P3 chores |
| #1, #25, #26 | enh P3 | Hardware probe — blocked on physical access |

---

## Risks and blockers

- Fix must preserve existing test injection seam (`deps.delegateStream`) and fall back to compat `streamSimple` for built-in APIs when no composed provider resolves — regression risk concentrated in `delegate-stream.ts`.
- `pi-ai/compat` import may still be needed for types (`SimpleStreamOptions`) even after behavior change; typecheck must stay green.

---

## Publish checklist (Phase 5–6)

- [ ] SP-238 `.DONE` on `main`
- [ ] Post-integrate `release:check` green (log path recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: patch
- [ ] `npm version patch` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` == 0.19.2
