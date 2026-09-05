# Release manifest — v1.0.0

**Created:** 2026-09-05
**Current version:** 0.22.0
**Target version:** v1.0.0
**Bump type:** major
**Profile:** major
**Theme:** 1.0 readiness — ship behavioral calibration quality, maintainable stage/port pipeline architecture, publish/engine honesty, and SemVer-stable operator docs (exit 0.y “may change until 1.0”).
**Operator approved scope:** yes (2026-09-05 — Broad epic via ask_question)
**Epic boundaries (operator-selected Broad, 2026-09-05):** #95, #110, #143, #150, #154, #155 + 1.0 migration docs + runtime peer bump to pi 0.85.1. Explicitly **out of epic:** #96/#167 encoder defaults, #162/#163/#157 toolchain majors, hardware #1/#25/#26, #151, #156.

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | 1.0 readiness: calibration + pipeline ports + publish hygiene | required (breaking / 1.0) | PASS |
| Documentation | 1.0 migration / SemVer stability guide (theme docs) | major: migration guides required | PASS (planned) |
| Bug fixes | 0 | soft; 0 OK | PASS (no open bugs) |
| Enhancements | 6 issues (#95, #110, #143, #150, #154, #155) + peer Include-S + theme docs | major: multiple OK | PASS |
| **Total tasks** | ~18 S/M after split (operator-defined) | major: operator-defined | PASS (pending packet authoring) |

**Profile audit:** PASS (pending operator **"approve release scope"**). Epic scope was not auto-selected from backlog alone — operator chose Broad via ask_question.

**Hygiene:** Peer bump counts toward total tasks, not enhancement budget. Majors (#162/#163/#157) stay deferred.

**Anti-feature-magnet note:** 16 open issues; none used to raise caps. Broad epic is operator-defined for major, not backlog inflation.

---

## Dependency freshness (Phase 1 — required)

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | ^0.84.4 (installed 0.84.4) | 0.85.1 | **Include SP-263** (peer drift) |
| `@earendil-works/pi-coding-agent` | ^0.84.4 (installed 0.84.4) | 0.85.1 | **Include SP-263** (same packet) |
| `@huggingface/transformers` | ^4.2.0 | 4.2.0 | Current |
| `better-sqlite3` | ^12.11.1 | 13.0.3 | **Defer #162** (native major) |
| `yaml` | ^2.9.0 | 2.9.0 | Current |
| `zod` | ^4.4.3 | 4.5.4 | **no bump** (in-range lag) |
| `typescript` | ^5.8.3 | 7.0.2 | **Defer #163** |
| `vitest` / `@vitest/coverage-v8` | ^3.2.3 | 5.0.0 | **Defer #163** |
| `eslint` | ^8.57.1 | 10.10.0 | **Defer #157** |
| `tsx` | ^4.23.0 | 4.23.13 | **no bump** (in-range) |
| `@types/node` | ^22.15.21 | 26.4.1 | **Defer #163** (types major) |

---

## Selected tasks

Proposed SP-IDs start at **SP-263** (`spine-tasks/CONTEXT.md` Next Task ID). All gaps — no pending SP-* for these issues. **L/XL epics (#143/#110/#95) must be S/M-split before Phase 3 commit.**

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-263 | — / #154 Partial | dep | S | Bump `@earendil-works/pi-*` to ^0.85.1 + align `minPiVersion` | Peer freshness; Contract includes `npm run release:check` |
| SP-264 | #154 Closes | dep | S | Pin CI Node to ≥22.19.0 + README engines note | `engines.node` already `>=22.19.0`; workflows still `node-version: "22"` |
| SP-265 | #150 Closes | enh | S | Remove or CI-guard committed `scripts/src` build artifacts | Fail closed on drift vs `src/` / stop tracking duplicates |
| SP-266 | #95 Partial | enh | S | Shadow dogfood protocol + release-gate soft-feed wiring | Operator-facing protocol already partial; harden gate soft-feed path |
| SP-267 | #95 Closes | enh | M | Human dogfood evidence pack + gate decision artifact | **Human QA** sessions; autonomous writes evidence under `_authoring/release-v1.0.0/` |
| SP-268 | #110 Partial | enh | S | Document zero-manual-label bootstrap fields | Acceptance: outcome fields sufficient without `/feedback` |
| SP-269 | #110 Partial | enh | S | Aggregate dogfood exports (≥30 sample floor where applicable) | Depends on SP-267 volume |
| SP-270 | #110 Partial | enh | S | Train P(success) + isotonic calibration; verify scripts green | `routing:train-*` + `routing:verify-calibration` |
| SP-271 | #110 Closes | enh | S | Ship `config/routing-calibration.json` (+ supersede synthetic weights when floors met) + README | Provenance non-synthetic |
| SP-272 | #143 Partial | enh | S | Introduce `PipelineStage` + shared `RoutingContext` | Hot file: `router-pipeline.ts` — serialize later extracts |
| SP-273 | #143 Partial | enh | M | Extract first stage cluster (triage / pin / hydra seams) behind context | Depends SP-272; no behavior change |
| SP-274 | #143 Partial | enh | M | Extract remaining stages; shrink orchestrator | Depends SP-273 |
| SP-275 | #143 Partial | enh | M | Define ports (`HardwareProbePort`, `LocalRuntimePort`, `TelemetryEmitterPort`); invert domain→infra | Depends SP-274 |
| SP-276 | #143 Closes | enh | S | Split `routing-telemetry.ts` / touch `session-pinner` only as needed for ports | Sub-tasks from #143; keep S if disjoint |
| SP-277 | #155 Partial | enh | M | Fragment `router-pipeline.test.ts` by stage (wave 1 modules) | Prefer after SP-273 so tests follow stage modules |
| SP-278 | #155 Closes | enh | S | Finish test fragmentation + delete monolith (or thin re-export) | Depends SP-277 |
| SP-279 | — (theme docs) | doc | M | 1.0 migration guide + README SemVer stability (drop “until 1.0” caveat) | After calibration + pipeline land; documents breaking expectations |

**Release scope ID (draft):** `SP-263,SP-264,SP-265,SP-266,SP-267,SP-268,SP-269,SP-270,SP-271,SP-272,SP-273,SP-274,SP-275,SP-276,SP-277,SP-278,SP-279`

**Issue → packet map:**

| Issue | Packets | Closes when |
|-------|---------|-------------|
| Peer drift | SP-263 | integrated |
| #154 | SP-263 Partial, SP-264 Closes | SP-264 |
| #150 | SP-265 | SP-265 |
| #95 | SP-266 Partial, SP-267 Closes | SP-267 (human evidence) |
| #110 | SP-268–SP-271 | SP-271 |
| #143 | SP-272–SP-276 | SP-276 |
| #155 | SP-277–SP-278 | SP-278 |
| Theme docs | SP-279 | SP-279 |

**Dependencies (author into `dependencies.json` in Phase 3):**

```text
SP-263: []
SP-264: []
SP-265: []
SP-266: []
SP-267: [SP-266]
SP-268: []
SP-269: [SP-267, SP-268]
SP-270: [SP-269]
SP-271: [SP-270]
SP-272: []
SP-273: [SP-272]
SP-274: [SP-273]
SP-275: [SP-274]
SP-276: [SP-275]
SP-277: [SP-273]
SP-278: [SP-277, SP-274]
SP-279: [SP-271, SP-276, SP-264, SP-265]
```

**Hot-file serialization:** `src/domain/pipeline/router-pipeline.ts` (SP-272→276), `tests/unit/router-pipeline.test.ts` (SP-277→278), `.pi/extensions/smart-router/index.ts` if peer bump touches extension, `package.json` / lockfile (SP-263/264).

**Wave sketch (≤4 M per wave; serialize hot files):**

```text
Wave 0: SP-263, SP-264, SP-265, SP-266, SP-268, SP-272   (hygiene + docs bootstrap + pipeline foundation)
Wave 1: SP-267 (human), SP-273, SP-277                  (dogfood evidence + first extract + test split start)
Wave 2: SP-269, SP-274, SP-278                          (aggregate + more stages + finish tests)
Wave 3: SP-270, SP-275                                  (train + ports)
Wave 4: SP-271, SP-276, SP-279                          (ship artifacts + telemetry split + 1.0 docs)
```

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-263 SP-264 SP-265 SP-266 SP-267 SP-268 SP-269 SP-270 SP-271 SP-272 SP-273 SP-274 SP-275 SP-276 SP-277 SP-278 SP-279
spine plan SP-263,SP-264,SP-265,SP-266,SP-267,SP-268,SP-269,SP-270,SP-271,SP-272,SP-273,SP-274,SP-275,SP-276,SP-277,SP-278,SP-279
spine run sequence SP-263,SP-264,SP-265,SP-266,SP-267,SP-268,SP-269,SP-270,SP-271,SP-272,SP-273,SP-274,SP-275,SP-276,SP-277,SP-278,SP-279 --dry-run
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (scope + theme) — **STOP here until approved**
2. `spine gate approve` per integrate wave
3. Publish approval before **exactly one** `npm version major`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| Peer bump | dep | SP-263 | create-spine-tasks (lean) |
| #154 | dep | SP-264 | create-spine-tasks (lean) |
| #150 | enh | SP-265 | create-spine-tasks (lean) |
| #95 | enh | SP-266, SP-267 | create-spine-tasks (lean) |
| #110 | enh | SP-268–SP-271 | create-spine-tasks (lean) |
| #143 | enh | SP-272–SP-276 | create-spine-tasks (lean) |
| #155 | enh | SP-277, SP-278 | create-spine-tasks (lean) |
| Theme docs | doc | SP-279 | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
Spine plan — ids
17 task(s) · 6 wave(s) · maxParallel 3

Wave 0 · 6 tasks · 2 rounds (queued by maxParallel)
  Round 1 (3 parallel): SP-263, SP-264, SP-265
  Round 2 (3 parallel): SP-266, SP-268, SP-272

Wave 1 · 2 tasks · 2 lanes in parallel
  SP-267, SP-273

Wave 2 · 3 tasks · 3 lanes in parallel
  SP-269, SP-274, SP-277

Wave 3 · 3 tasks · 3 lanes in parallel
  SP-270, SP-275, SP-278

Wave 4 · 2 tasks · 2 lanes in parallel
  SP-271, SP-276

Wave 5 · 1 task
  SP-279
```

**Profile audit:** PASS (operator approved scope 2026-09-05)
---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #96 | enh | Funnel | Encoder default enablement after #110/#95 evidence; not 1.0 ship-or-die |
| #167 | enh | Funnel | Granite opt-in dogfood feeds #96 |
| #162 | deps | Ready | better-sqlite3 v13 — dedicated hygiene theme |
| #163 | deps | Funnel | TS7 / vitest4 / @types/node26 majors |
| #157 | chore | Funnel | ESLint flat config |
| #151 | enh | Ready | Hardware probe unit tests — next hygiene/test train |
| #156 | chore | Funnel | Spine STATUS/.DONE hygiene — backlog cycle |
| #1 / #25 / #26 | epic | Parked | Hardware — physical access |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #96 | Encoder default go/no-go after 1.0 calibration evidence | Funnel |
| #167 | Opt-in Granite dogfood runbook | Funnel |
| #162 | Native sqlite major validation | Ready |
| #151 | Hardware probe unit-test coverage | Ready |
| #157 | ESLint 9 flat-config migration | Funnel |
| #163 | Toolchain majors (TS7/vitest4) | Funnel |
| #156 | Spine marker hygiene | Funnel |

---

## Risks and blockers

- **#95 / #110 human dogfood:** SP-267 needs real pi sessions; sample floor may slip → do not invent labels; slip #110 ship if floors unmet (document operator-local calibration instead).
- **#143 hot file (~2103 lines) + tests (~2206 lines):** serialize SP-272–278; expect multi-wave; do not parallel-edit `router-pipeline.ts`.
- **Peer 0.85.1:** may surface API/engine drift; keep SP-263 early so later waves absorb fallout.
- **Git:** `main` is ahead of `origin/main` by 1 (skill docs commit) — push or reconcile before publish gates.
- **Stale worktrees:** doctor reported leftover batch dirs — `spine cleanup worktrees` before Phase 4.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave**
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD`
- [ ] `npm run release:assert-content` green vs `v0.22.0`
- [ ] Manifest target == expected next version (`0.22.0` + major → `1.0.0`)
- [ ] No existing git tag `v1.0.0`
- [ ] CI green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **major**
- [ ] **Exactly one** `npm version major` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view` `latest` == `1.0.0`
