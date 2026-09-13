# Release manifest — v1.2.0

**Created:** 2026-09-12
**Current version:** 1.1.0
**Target version:** v1.2.0
**Bump type:** minor
**Profile:** minor
**Theme:** Long-context encoder path — eval-first Granite gated cascade (#173) plus opt-in Granite dogfood runbook (#167).
**Operator approved scope:** yes (2026-09-12 — data-backed slate: #173 + #167 + #174; defer #110)

**Non-quota ops:** #174 (GitHub Actions Node-24 runtimes) is included as CI/toolchain hygiene and **does not** count toward enhancement or total-task caps (operator directive).

**Scope revision (2026-09-12):** Operator accepted data-backed recommendation — **defer #110** (HyDRA ≥100 blocked: `embedding_json` non-null = 0; session-holdout ECE FAIL at 0.1005 on n=30). Prior draft with #110 remainder superseded.

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Long-context encoder path (Granite cascade + opt-in runbook) | required | PASS |
| Documentation | theme docs via SP-294 + SP-295 | minor theme docs | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 2 (#173, #167) | minor 1–3 related | PASS |
| **Total tasks (quota)** | 6 | minor ≤15 | PASS |
| Ops (non-quota) | 1 (#174 → SP-290) | excluded from caps | N/A |

**Profile audit:** PASS (pending operator scope approval)

**Hygiene (patch only, if any):** none (minor profile)

---

## Dependency freshness (Phase 1 — required)

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | ^0.85.1 | 0.85.1 | Current |
| `@earendil-works/pi-coding-agent` | ^0.85.1 (dev) / peer `*` | 0.85.1 | Current |
| `@huggingface/transformers` | ^4.2.0 | 4.2.0 | Current |
| `better-sqlite3` | ^12.11.1 | 13.0.3 | Defer #162 (major) |
| `yaml` | ^2.9.0 | 2.9.1 | no bump (in-range lag) |
| `zod` | ^4.4.3 | 4.6.3 | no bump (in-range lag) |
| `typescript` | ^5.8.3 | 7.0.2 | Defer #163 (major) |
| `vitest` / `@vitest/coverage-v8` | ^3.2.3 | 5.0.0 | Defer #163 (major) |
| `eslint` | ^8.57.1 | 10.10.0 | Defer #157 (flat config) |
| `tsx` | ^4.23.0 | 4.23.13 | no bump (in-range lag) |
| `@types/node` | ^22.15.21 | 22.20.2 | no bump (in-range lag) |

---

## Data inventory (scope decision evidence)

| Asset | State | Implication |
|-------|-------|-------------|
| Verifier-grade ship (v1.1) | 243 labeled; hash-split ECE 0.0645 PASS | P(success)+isotonic already shipped |
| Session-holdout retrain | ECE 0.1005 FAIL; holdout n=30 | Needs more labeled holdout — **defer #110** |
| HyDRA projection | `trained_sample_count: 0` | **defer #110** |
| Embeddings in `state.db` / exports / ship-grade agg | **0** non-null | Cannot hit HyDRA ≥100 this train |
| Granite ONNX cache | absent (MiniLM only) | #167 close needs human enablement; runbook OK |
| Cascade (#173) | code + fixture/eval | Unblocked for autonomous ship |

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-289 | — | chore | S | v1.2.0 manifest scaffold | Bookkeeping |
| SP-290 | #174 | ops | S | bump GHA to Node-24 runtimes | **Non-quota**; Closes #174 |
| SP-291 | #173 | enh | M | encoder cascade config + gate | Partial #173 |
| SP-292 | #173 | enh | M | cascading embedder + telemetry | Partial #173 |
| SP-293 | #173 | enh | M | per-encoder centroids + cal verify | Partial #173 |
| SP-294 | #173 | docs | S | cascade docs + eval report | Closes #173 with SP-291–293 |
| SP-295 | #167 | enh | S | Granite opt-in dogfood runbook | Closes #167 if AC met; else Partial (human dogfood) |

**Release scope ID:** `SP-289,SP-290,SP-291,SP-292,SP-293,SP-294,SP-295`

**Quota accounting:** enhancements = 2 issues (#173, #167); quota tasks = SP-289 + SP-291–SP-295 (6); SP-290 excluded from both enhancement and total-task caps.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-289 SP-290 SP-291 SP-292 SP-293 SP-294 SP-295
spine plan SP-289,SP-290,SP-291,SP-292,SP-293,SP-294,SP-295
spine run sequence SP-289,SP-290,SP-291,SP-292,SP-293,SP-294,SP-295 --dry-run
spine run sequence SP-289,SP-290,SP-291,SP-292,SP-293,SP-294,SP-295
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (operator sign-off on scope + theme) — **awaiting**
2. `spine gate approve` per integrate wave
3. Publish approval before exactly one `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| — (scaffold) | chore | SP-289 | create-spine-tasks (lean) |
| #174 | ops | SP-290 | create-spine-tasks (lean) |
| #173 | enh | SP-291–SP-294 | create-spine-tasks (lean) |
| #167 | enh | SP-295 | create-spine-tasks (lean) |

All gaps — no pending SP-* today (`spine plan pending` = 0).

---

## Wave plan snapshot

```text
Spine plan — ids
7 task(s) · 5 wave(s) · maxParallel 3

Wave 0 · 1 task
  Lane 1: SP-289 — v1.2.0 manifest scaffold

Wave 1 · 3 tasks · 3 lanes in parallel
  Lane 1: SP-290 — bump GitHub Actions to Node-24 runtimes
  Lane 2: SP-291 — encoder cascade config + gate
  Lane 3: SP-295 — Granite opt-in dogfood runbook

Wave 2 · 1 task
  Lane 1: SP-292 — cascading embedder + telemetry

Wave 3 · 1 task
  Lane 1: SP-293 — per-encoder centroids + calibration verify

Wave 4 · 1 task
  Lane 1: SP-294 — cascade docs + eval report
```

Hot-file serialize: embedding-provider.ts / schemas across SP-291→SP-292→SP-293 (waves 1–3 sequential for cascade core). Wave 1 parallels #174 YAML ∥ gate ∥ #167 docs (disjoint).

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #110 | enh | Funnel | HyDRA ≥100 + session-holdout ECE — blocked on embeddings=0 / holdout volume |
| #95 | enh | Funnel | Shadow dogfood human gate — feeds #110 embeddings |
| #96 | enh | Funnel | modernbert_k4 default — no flip |
| #151 | enh | Funnel | hardware probe unit tests |
| #156 | chore | Funnel | STATUS/.DONE hygiene |
| #157 | enh | Ready | ESLint flat config — hygiene theme |
| #162 | enh | Ready | better-sqlite3 v13 — hygiene theme |
| #163 | enh | Ready | TS7 / vitest 4 majors — hygiene theme |
| #172 | enh | Funnel | optional baseline refresh P3 |
| #1 / #25 / #26 | epic | Parked | Hardware — physical access |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #110 | Calibration remainder after embedding capture + holdout growth | Funnel |
| #95 | Shadow quality/cost dogfood vs release gates (enables #110) | Funnel |
| #162 | better-sqlite3 v13 hygiene | Ready |
| #163 | TypeScript / vitest toolchain majors | Ready |
| #157 | ESLint flat-config hygiene | Ready |
| #96 | modernbert_k4 enablement decision | Funnel |
| #172 | Eval baseline refresh (operator-approved) | Funnel |

Open-issue count must **not** raise this release’s enhancement or total-task caps.

---

## Risks and blockers

- **#167 human AC:** Granite ONNX not cached; closing may stay Partial until operator dogfood switch + measurements.
- **#173 hot files:** serialize `embedding-provider.ts` / schemas / centroid bootstrap across SP-291–293.
- **No default flips:** MiniLM / learned_projection / frugality remain; #96 untouched.
- Prefer detached `spine batch start` (omit `--attached`).

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave**
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD`
- [ ] `npm run release:assert-content` green vs `v1.1.0`
- [ ] Manifest target == expected next version from `package.json` + minor (`1.2.0`)
- [ ] No existing git tag `v1.2.0`
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: minor
- [ ] **Exactly one** `npm version minor` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view` `latest` matches `1.2.0`
