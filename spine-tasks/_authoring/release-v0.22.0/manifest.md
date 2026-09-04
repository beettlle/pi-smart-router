# Release manifest — v0.22.0

**Created:** 2026-09-04
**Current version:** 0.21.0 (package.json; last tag `v0.21.0`)
**Target version:** v0.22.0
**Bump type:** minor
**Profile:** minor
**Theme:** Extension package boundary and ONNX embedder supply-chain integrity — stable public facade for the pi extension, measured extension coverage, and digest-pinned artifacts with real embedder dispose.
**Operator approved scope:** yes (2026-09-04)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Extension package boundary + ONNX supply-chain (#149/#144/#147) | required | PASS |
| Documentation | 1 (theme docs SP-262) | minor theme docs | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 3 issues (#149, #144, #147) → 7 S packets | minor 1–3 related | PASS |
| Total tasks | 8 | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene:** none (theme docs are operator-facing for shipped capability, not patch hygiene)

**Anti-feature-magnet note:** 19 open issues (all `enhancement`); none used to raise caps. This train ships 3 sibling P1 package-integrity issues. Deferred P0/P1 dogfood (#95/#110/#96), pipeline split (#143), hardware (#1/#25/#26), and deps (#162/#163) stay on next-train slate.

**Sizing rationale:** Each enhancement mixes ≥2 concerns (API surface vs migration/guards; coverage config vs docs; pin verify vs dispose lifecycle). Split into Size-S packets at testable seams, matching v0.21 S-decomposition for lane success rate. Theme docs last so README/C4 notes match shipped behavior.

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-255 | #149 Partial | enh | S | Public package facade exports for extension needs | Expand `src/index.ts` / facade so extension-required types & factories are stable exports; unit/typecheck only — no mass import migration yet |
| SP-256 | #149 Partial | enh | S | Migrate extension deep `src/` imports to facade | Depends on SP-255. Rewrite `.pi/extensions/smart-router/**` off `../../../src/` (target 0 deep imports); keep behavior |
| SP-257 | #149 Closes | enh | S | ESLint/CI guard blocking extension deep imports | Depends on SP-256. `no-restricted-imports` (or equivalent) + CI fail on new `../../../src/` from `.pi/extensions/**` |
| SP-258 | #144 Closes | enh | S | Vitest extension coverage include + threshold | Add `.pi/extensions/smart-router/**/*.ts` to coverage include; initial ≥80% lines; wire `coverage:check` / CI |
| SP-259 | #147 Partial | enh | S | Pin ONNX artifacts by SHA-256 + verify on load | Config digests for MiniLM/Granite; fail closed when pin configured and mismatch/missing; unit tests |
| SP-260 | #147 Closes | enh | S | Real embedder `dispose()` + lifecycle tests | Depends on SP-259. Release ONNX session handles (not no-op); hydra/embedder tests prove dispose |
| SP-261 | #147 Partial | doc | S | Supply-chain / offline cache operator docs | Depends on SP-259. README or docs: cache warm, accepted `npm audit` posture, no anonymous fetch when pinned |
| SP-262 | — (theme docs) | doc | S | Theme docs: facade + coverage + pin operator notes | Depends on SP-257, SP-258, SP-260, SP-261. Embedding section / testing section cross-links; C4 parity note |

**Issue → packet status:** #149/#144/#147 have no existing pending SP-* → author in Phase 3. Enhancement **issue** count = 3 (profile cap); task count = **8** after S-split + theme docs.

**File-scope disjointness (wave 0 seeds):**
- SP-255: `src/index.ts` (+ thin facade module under `src/` if needed); tests under `tests/unit/`
- SP-258: `vitest.config.ts`, coverage scripts/CI; may touch extension tests only for coverage gaps
- SP-259: `src/domain/matching/embedding-provider.ts`, config schema / digests, unit tests

Wave-1 dependents stay on issue lanes (SP-256→257 on extension; SP-260 on embedder). SP-258 does not fight #149 migration if run after or parallel to facade *definition* only — prefer SP-258 after SP-256 so coverage measures migrated imports, **or** wave SP-258 with SP-255 if thresholds measured on current tree then re-ratchet. **Preferred:** Wave 0: SP-255, SP-258, SP-259; Wave 1: SP-256, SP-260, SP-261; Wave 2: SP-257, SP-262.

**Release scope ID:** `SP-255,SP-256,SP-257,SP-258,SP-259,SP-260,SP-261,SP-262`

**Dependencies (author into `dependencies.json` in Phase 3):**

```text
SP-255: []
SP-256: [SP-255]
SP-257: [SP-256]
SP-258: []
SP-259: []
SP-260: [SP-259]
SP-261: [SP-259]
SP-262: [SP-257, SP-258, SP-260, SP-261]
```

---

## Sequence runner (Phase 4)

The manifest is the operator contract; the CLI takes the **scope ID string**, not the manifest file path.

```bash
spine tasks validate SP-255 SP-256 SP-257 SP-258 SP-259 SP-260 SP-261 SP-262
spine plan SP-255,SP-256,SP-257,SP-258,SP-259,SP-260,SP-261,SP-262
spine run sequence SP-255,SP-256,SP-257,SP-258,SP-259,SP-260,SP-261,SP-262 --dry-run
spine run sequence SP-255,SP-256,SP-257,SP-258,SP-259,SP-260,SP-261,SP-262    # detached — omit --attached
```

**Regression gate** (after each integrate, before next wave):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates** (human only):

1. Approve this manifest (operator sign-off on scope + theme)
2. `spine gate approve` per integrate wave
3. Publish approval before **exactly one** `npm version minor` (after `release:assert-content` PASS)

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #149 Partial | enh | SP-255 | create-spine-tasks (lean) |
| #149 Partial | enh | SP-256 | create-spine-tasks (lean) |
| #149 Closes | enh | SP-257 | create-spine-tasks (lean) |
| #144 Closes | enh | SP-258 | create-spine-tasks (lean) |
| #147 Partial | enh | SP-259 | create-spine-tasks (lean) |
| #147 Closes | enh | SP-260 | create-spine-tasks (lean) |
| #147 Partial | doc | SP-261 | create-spine-tasks (lean) |
| — (theme docs) | doc | SP-262 | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
Spine plan — ids
8 task(s) · 4 wave(s) · maxParallel 3

Wave 0 · 3 tasks · 3 lanes in parallel
  Lane 1: SP-255 — Public package facade exports for extension needs
  Lane 2: SP-258 — Vitest extension coverage include + threshold
  Lane 3: SP-259 — Pin ONNX artifacts by SHA-256 + verify on load

Wave 1 · 3 tasks · 3 lanes in parallel
  Lane 1: SP-256 — Migrate extension deep src imports to facade
  Lane 2: SP-260 — Real embedder dispose() + lifecycle tests
  Lane 3: SP-261 — Supply-chain / offline cache operator docs

Wave 2 · 1 task
  Lane 1: SP-257 — ESLint/CI guard blocking extension deep imports

Wave 3 · 1 task
  Lane 1: SP-262 — Theme docs: facade + coverage + pin operator notes
```

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #95 | enh P0 | Funnel | Human shadow dogfood sessions; protocol exists; not this package-integrity theme |
| #110 | enh P1 | Funnel | Behavioral calibration adoption needs dogfood volume from #95 |
| #96 | enh P2 | Funnel | modernbert_k4 enablement decision; depends on measurement / #167 evidence |
| #143 | enh P1 | Funnel | RouterPipeline split — L/XL; own multi-wave minor |
| #167 | enh P2 | Ready | Granite opt-in dogfood — adjacent to #147 but enablement/runbook, not pin/dispose |
| #150 | enh P2 | Ready | scripts/src artifact hygiene — separate hygiene theme |
| #151 | enh P2 | Ready | SystemInfoPort unit tests — hardware theme |
| #154 | enh P2 | Ready | Node engines alignment — hygiene/deps theme |
| #155 | enh P2 | Funnel | Fragment router-pipeline.test.ts — pairs with #143 |
| #156 | enh P3 | Ready | spine STATUS/.DONE hygiene |
| #157 | enh P3 | Ready | ESLint flat config — may interact with SP-257; defer to avoid lint epic in this train |
| #162 | enh P2 | Ready | better-sqlite3 v13 — deps theme |
| #163 | enh P3 | Parked | typescript/vitest majors — high regression risk |
| #1 / #25 / #26 | enh P3 | Parked | Hardware — physical access |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #95 | Shadow quality/cost dogfood before frugality | Funnel |
| #110 | Behavioral calibration adoption | Funnel |
| #96 | modernbert_k4 enablement decision | Funnel |
| #167 | Opt-in Granite encoder dogfood | Ready |
| #143 | RouterPipeline split / ports | Funnel |
| #150 + #154 | Build-artifact & Node-engine hygiene | Ready |
| #162 | better-sqlite3 v13 deps bump | Ready |

Open-issue count must **not** raise this release’s enhancement or total-task caps.

---

## Risks and blockers

- Hot file: `.pi/extensions/smart-router/index.ts` — serialize SP-256/SP-257 vs other extension work
- Hot file: `src/domain/matching/embedding-provider.ts` — serialize SP-259/SP-260
- SP-258 may fail initial ≥80% until extension tests catch up — allow documented ratchet in packet if baseline is lower, but keep gate real (no theater)
- #147 `dispose()` may be constrained by `@huggingface/transformers` API — packet must fail closed or document accepted limitation with a real resource-release path (no no-op theater)
- Stale worktree leftover (`spine-20260820T174253`) — cleanup before batch if preflight warns
- Quota risk on kimi worker pin — prefer detached batches; switch allegretto/profile if plan-review 429

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] `npm run release:assert-content` green (substantive delta vs last release tag)
- [ ] Manifest target == expected next version from `package.json` + bump type (`0.21.0` + minor → `0.22.0`)
- [ ] No existing git tag `v0.22.0`
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **minor** (matches Phase 2)
- [ ] **Exactly one** `npm version minor` then `git push && git push --tags` — then **STOP** (no second bump)
- [ ] `release.yml` succeeded; `npm view` `latest` matches `0.22.0` (else Publish recovery, do not re-bump)

---

## Phase 0–1 intake summary

| Check | Result |
|-------|--------|
| Branch / dirty | `main`, clean, up to date with `origin/main` |
| Current / target | `0.21.0` → `v0.22.0` (minor) |
| Tag `v0.22.0` | absent |
| `spine doctor` | pass (warnings: PATH pi mismatch, non-TTY attached risk, kimi quota, 1 stale worktree) |
| Pending SP-* | **0** (253 `.DONE`) |
| Open bugs / docs labels | **0** / **0** |
| Open enhancements | **19** |
| Next Task ID | SP-255 |
