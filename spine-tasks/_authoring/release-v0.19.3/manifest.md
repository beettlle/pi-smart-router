# Release manifest — v0.19.3

**Created:** 2026-08-29
**Current version:** 0.19.2
**Target version:** v0.19.3
**Bump type:** patch
**Profile:** patch
**Theme:** Worker-facing stability hotfix — de-flake the wall-clock test suites that fail spine contract runs under local load (#161), and refresh dependency alignment so the extension tracks the current pi 0.84.x runtime (pi-ai / pi-coding-agent 0.80.x → 0.84.x).
**Operator approved scope:** yes (2026-08-29 — "approve release scope and create tickets to update better-sqlite3 and typescript, vitest, @types/node later")

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Worker-facing stability + dependency freshness | required | PASS |
| Documentation | 0 | patch 0–2 | PASS (none needed) |
| Bug fixes | 1 (#161) | soft 1–5; 0 OK if none open | PASS (only open `bug` issue) |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 2 | patch ≤8 | PASS |

**Profile audit:** PASS — one high-impact worker-facing bug (S), one S-sized dependency/hygiene task, zero enhancements, single wave. Dep refresh adds no user-facing capability (compat-layer imports only; no API usage changes).

**Hygiene (patch only, if any):** SP-240 dependency refresh — non-user-facing maintenance: caret bumps of `@earendil-works/pi-ai`/`pi-coding-agent` to match the running pi 0.84.3, in-range lockfile refresh of `zod`/`tsx`, and `engines.node` floor raised to `>=22.19.0` to match pi-ai@0.84.4's requirement (partially addresses #154's EBADENGINE complaint). No new capability. Flagged for operator: if this is judged an enhancement, bump to minor instead.

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-239 | #161 | bug | S | De-flake wall-clock timing assertions (triage-engine SC-004, local-zero-tier parallel ratio, pi-model-scope resolution) | Closes #161 |
| SP-240 | — (Partial: #154) | hygiene/chore | S | Dependency refresh: pi-ai + pi-coding-agent → ^0.84.4, zod/tsx lockfile refresh, engines.node >=22.19.0 | Partial: #154 |

**Release scope ID:** SP-239,SP-240

---

## Sequence runner (Phase 4)

The manifest is the operator contract; the CLI takes the **scope ID string**, not the manifest file path.

```bash
spine tasks validate SP-239,SP-240
spine plan SP-239,SP-240
spine run sequence SP-239,SP-240 --dry-run
spine run sequence SP-239,SP-240    # detached — omit --attached
```

Per-wave manual loop (alternative to full sequence):

```bash
spine batch start SP-239,SP-240 --wave 1
spine status --diagnose
spine gate approve && spine integrate && npm install && spine batch complete
```

**Regression gate** (after each integrate, before next wave):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-1.log
test "${PIPESTATUS[0]}" -eq 0
```

Do **not** use `| tail` alone for pass/fail — verify exit code.

**Operator gates** (human only):

1. Approve this manifest (operator sign-off on scope + theme)
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version patch`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #161 | bug | SP-239 | create-spine-tasks (lean) + packet-from-issue.md — **authored 2026-08-29** |
| — (dep refresh, Partial #154) | chore | SP-240 | create-spine-tasks (lean) — **authored 2026-08-29** |

---

## Wave plan snapshot

```text
Spine plan — ids (2026-08-29)
2 task(s) · 2 wave(s) · maxParallel 3

Wave 0 · 1 task
  Lane 1: SP-239 — De-flake wall-clock timing assertions under local load

Wave 1 · 1 task
  Lane 1: SP-240 — Dependency refresh: pi-ai/pi-coding-agent 0.84.x + lockfile hygiene
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| better-sqlite3 12→13 (+ @types 7→9) | dep (major) | Native module major bump; needs dedicated validation window — **filed as #162** (2026-08-29) |
| typescript 5→7, vitest 3→4, @types/node 26 | dep (major, dev) | Toolchain majors; regression risk disproportionate to a stability patch — **filed as #163** (2026-08-29) |
| #154 (remainder) | enh P2 | Full engine-requirements alignment beyond the engines.node floor rides in SP-240; rest deferred |
| #157 ESLint flat config | enh P3 | Outside theme; chore modernization |
| #156 STATUS/.DONE hygiene | enh P3 | Outside theme |
| #155 fragment router-pipeline.test.ts | enh P2 | Test-infra refactor; complements #161 but enhancement-classified — next minor |
| #149, #148, #147, #146, #145, #144, #143 | enh P1 | Architecture/security/features — minor-release material |
| #151, #150 | enh P2 | Outside theme |
| #110, #96, #95 | enh P1/P0/P2 | Roadmap enhancements; #95 needs shadow dogfood first |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- SP-240 caret bump of pi-ai crosses 0.80→0.84 (0.x minor of dependency). Mitigated: our imports are 15× `pi-ai/compat` (stable layer) + 1 root import (`isContextOverflow`); peer deps are `*`; contract runs full test suite + `release:check`.
- `engines.node` floor raise (`>=22.19.0`) tightens install requirements for users on early 22.x — intentional alignment with pi-ai@0.84.4; flagged at operator gate.
- Flaky-fix must not weaken the assertions' signal (no deleting timing tests; retries/baselines only).

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: patch (matches Phase 2)
- [ ] `npm version patch` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches target
