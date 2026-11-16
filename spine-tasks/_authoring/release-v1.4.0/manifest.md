# Release manifest — v1.4.0

**Created:** 2026-11-15
**Current version:** 1.3.0 (npm `latest` 1.3.0; tag `v1.3.0`)
**Target version:** v1.4.0
**Bump type:** minor
**Profile:** minor
**Theme:** New model coverage — ship Kimi K3 / K3.1 Pro fleet mapping + Gemini 4 carbon/hydrogen coverage, and keep curated Claude/Gemini grounding intact on live benchmark refresh.
**Operator approved scope:** yes (2026-11-15) — run all waves + land loop after each; wait for approval before publish bump/push

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | New model coverage (Kimi K3/K3.1 + Gemini 4 carbon/hydrogen + curated grounding) | required | PASS |
| Documentation | 1 (SP-319 operator-facing fleet note) | minor theme docs | PASS |
| Bug fixes | 2 (#195, #199) | soft; 0 OK | PASS |
| Enhancements | 3 (#196, #197, #200) — all new-model | minor 1–3 related | PASS |
| **Total tasks** | 7 packets (incl. 1 peer hygiene) | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene:** none beyond peer-drift Size-S bump (not an enhancement; counts toward total tasks only).

Open bugs **not** in theme (deferred, not skipped silently):

| Issue | Why deferred |
|-------|----------------|
| #182 | Epic — glm-5.3-flash runaway / deep-session guards; separate theme with #179/#181 |
| #194 | Circuit-breaker / unparseable provider errors — failover bug, not new-model coverage |

---

## Dependency freshness (Phase 1 — required)

Inventory on 2026-11-15: `npm outdated --long`, `npm view <pkg> version`. Declared ranges from `package.json`; lockfile currents from `npm outdated`.

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | peer `*` + dev `^1.3.0` (lockfile 1.4.0) | 1.5.2 | **Include SP-313** (peer drift Size-S; theme-adjacent — registry exposes K3.1 / Gemini 4 fleet) |
| `@earendil-works/pi-coding-agent` | peer `*` + dev `^1.3.0` (lockfile 1.4.0) | 1.5.2 | **Include SP-313** (same bump) |
| `@huggingface/transformers` | `^4.2.0` (4.2.0) | 4.3.2 | no bump (in-range) |
| `better-sqlite3` | `^12.11.1` | 13.2.0 | Defer #162 (major) |
| `yaml` | `^2.9.0` (2.9.0) | 2.9.1 | no bump (in-range) |
| `zod` | `^4.4.3` (4.5.4) | 4.6.7 | no bump (in-range) |
| `typescript` | `^5.8.3` (5.9.3) | 7.0.2 | Defer #163 (major) |
| `vitest` / `@vitest/coverage-v8` | `^3.2.3` (3.2.6) | 5.1.0 | Defer #163 (major) |
| `eslint` | `^8.57.1` | 10.15.0 | Defer #157 (flat config) |
| `tsx` | `^4.23.0` (4.23.12) | 4.23.15 | no bump (in-range) |
| `@types/node` | `^22.15.21` (22.20.0) | 26.6.6 | Defer #163 (major) |
| `@types/better-sqlite3` | `^7.6.13` | 9.6.0 | Defer #162 (with better-sqlite3 major) |

---

## Selected tasks

All new-model GitHub work is a **gap** (no pending SP-*; Next Task ID = SP-313). Packets to author in Phase 3 after scope approval:

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-313 | — | dep | S | Align `@earendil-works/pi-ai` + `pi-coding-agent` to ^1.5.2 (+ lockfile) | Peer drift; Contract includes `npm run release:check` |
| SP-314 | #195 | bug | S | Kimi K3 / K3.1 `MODEL_PATTERN_RULES` → `FRONTIER_DEFAULTS` | Closes #195; `pi-model-mapper.ts` |
| SP-315 | #196 | enh | S | Unit coverage for Kimi K3 / K3.1 mapper ids | Closes #196; depends SP-314 |
| SP-316 | #197 | enh | M | Benchmark-grounded capability row + aliases for K3.1 Pro | Closes #197; depends SP-314 + SP-317 |
| SP-317 | #199 | bug | M | Live refresh preserves SP-311 curated Claude/Gemini rows | Closes #199; ingest/merge + regression test |
| SP-318 | #200 | enh | S | Cover `gemini-4-carbon` / `gemini-4-hydrogen` (aliases, tests, grounding) | Closes #200; depends SP-316 (serialize artifact) |
| SP-319 | — | doc | S | Operator docs: newly covered Kimi K3.1 + Gemini 4 carbon/hydrogen fleet | Theme docs; depends SP-314, SP-316, SP-318 |

**Release scope ID:** `SP-313,SP-314,SP-315,SP-316,SP-317,SP-318,SP-319`

### Dependency edges (planned)

| Task | Depends on | Why |
|------|------------|-----|
| SP-313 | — | Lockfile/peers; disjoint from mapper |
| SP-314 | — | Pattern rule foundation for Kimi family |
| SP-315 | SP-314 | Tests assert the new rule |
| SP-316 | SP-314, SP-317 | Grounding after pattern rule + curated-row preserve |
| SP-317 | — | Ingest merge / curated-row preservation; can parallel SP-314 |
| SP-318 | SP-316 | Gemini 4 aliases/tests after Kimi grounding artifact edits |
| SP-319 | SP-314, SP-316, SP-318 | Docs after shipped coverage |

**Hot-file serialization:** `src/config/pi-model-mapper.ts` (SP-314 → SP-315); `config/benchmark-profiles.json` + ingest scripts (SP-317 → SP-316 → SP-318).

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-313 SP-314 SP-315 SP-316 SP-317 SP-318 SP-319
spine plan SP-313,SP-314,SP-315,SP-316,SP-317,SP-318,SP-319
spine run sequence SP-313,SP-314,SP-315,SP-316,SP-317,SP-318,SP-319 --dry-run
export SPINE_STET_NO_AUTO_FINISH=1
spine batch start <release-scope> --wave N    # detached — omit --attached
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-v140-wave-${WAVE}.log
test "${PIPESTATUS[0]}" -eq 0
```

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| (peer drift) | dep | SP-313 | create-spine-tasks (lean) |
| #195 | bug | SP-314 | create-spine-tasks (lean) |
| #196 | enh | SP-315 | create-spine-tasks (lean) |
| #197 | enh | SP-316 | create-spine-tasks (lean) |
| #199 | bug | SP-317 | create-spine-tasks (lean) |
| #200 | enh | SP-318 | create-spine-tasks (lean) |
| (theme docs) | doc | SP-319 | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
Wave 0: SP-313, SP-314, SP-317   (peers + Kimi rule + curated-row fix; disjoint files)
Wave 1: SP-315, SP-316           (Kimi tests + grounding; after SP-314 + SP-317)
Wave 2: SP-318                   (Gemini carbon/hydrogen; after SP-316)
Wave 3: SP-319                   (docs)
```

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #194 | bug | Ready | Failover / circuit-breaker — not new-model coverage |
| #179, #181, #182 | enh/bug epic | Funnel / Parked | Deep-session flash-runaway guards — separate theme |
| #188, #189, #190 | enh | Ready | Typed-judgment consumers (Sprint 2) — next-train slate |
| #191 | eval | Funnel | Needs #188/#189 + operator judgment cache |
| #110, #95, #96, #167, #172 | enh/eval | Funnel | Calibration / encoder track |
| #151 | enh | Ready | Hardware probe unit tests — hygiene |
| #162, #163, #157, #156 | chore/deps | Ready | Toolchain majors — hygiene theme |
| #1, #25, #26 | epic | Parked | Hardware — physical access |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #194 | Failover correctness: unparseable provider errors trip breaker | Ready |
| #188, #189 | Typed-judgment consumers: tier hints, local_zero, HyDRA requirements | Ready |
| #190 | Adaptive reasoning follows `needs_deep_reasoning` | Ready |
| #179, #181 | Deep-session guards: capability floor + degenerate-output failover | Ready |
| #162, #163, #157 | Toolchain hygiene (better-sqlite3 13, TS/vitest majors, ESLint flat) | Ready |

Open-issue count must **not** raise this release’s enhancement or total-task caps.

---

## Risks and blockers

- **Hot files:** `src/config/pi-model-mapper.ts` (SP-314/315); `config/benchmark-profiles.json` + ingest (SP-316/317/318) — serialize via deps / wave order.
- **#199 vs live refresh:** v1.3.0 used `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1` workaround; SP-317 must make unskipped `release:check` safe before publish.
- **#197 scores:** prefer third-party leaderboard values; never invent benchmarks — ungrounded stays `pattern_default` with provenance.
- **Peer bump SP-313:** may require `pi.minPiVersion` / engines alignment if 1.5.2 docs demand it; Contract must run `npm run release:check`.
- **stet:** export `SPINE_STET_NO_AUTO_FINISH=1`; keep `lanes.maxParallel` at 2.

---

## Publish checklist (Phase 5–6)

- [x] All release-scoped tasks `.DONE` on `main`
- [x] Post-integrate `release:check` green after waves (logs under `/tmp/pi-smart-router-post-integrate-v140-*.log`; final `/tmp/pi-smart-router-release-check-v140-final.log`)
- [x] `spine preflight` green (0 pending)
- [x] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [x] `npm run release:assert-content` green (substantive delta vs last release tag)
- [x] Manifest target == expected next version from `package.json` + bump type (`1.3.0` + minor → `1.4.0`)
- [x] No existing git tag `v1.4.0`
- [x] CI workflow green on `HEAD` (https://github.com/beettlle/pi-smart-router/actions/runs/43789506550)
- [x] `git status` clean (at Phase 5 freeze; CONTEXT/manifest note commits OK)
- [ ] Operator approved publish bump type: minor
- [ ] **Exactly one** `npm version minor` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view` `latest` == 1.4.0 (else Publish recovery, do not re-bump)
