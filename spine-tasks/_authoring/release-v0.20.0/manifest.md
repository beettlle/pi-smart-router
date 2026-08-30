# Release manifest — v0.20.0

**Created:** 2026-08-30
**Current version:** 0.19.4 (accidental empty bump; last themed release was v0.19.3)
**Target version:** v0.20.0
**Bump type:** minor
**Profile:** minor
**Theme:** Routing cost and verbosity economics — soft-bias selection with peak/off-peak priors (#165) and post-turn usage calibration (#164), and set adaptive reasoning/thinking intensity so chatty models stay lean on routine tool turns (#166).
**Operator approved scope:** yes (2026-08-30 — "approve release scope")

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Routing cost & verbosity economics (#164/#165/#166) | required | PASS |
| Documentation | Theme docs embedded in each issue packet (README economics / operator sections) | minor theme docs | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 3 related (#164, #165, #166) | minor 1–3 related | PASS |
| **Total tasks** | 6 (2 S/M per issue) | minor ≤15 | PASS |

**Profile audit:** PASS — three related P1 enhancements completing one economics/verbosity theme; zero open bugs; no dep majors; total 6 ≤15.

**Hygiene (patch only, if any):** none (minor profile). Dependency check-only this train (operator choice).

---

## Dependency freshness (Phase 1 check — no bumps)

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | ^0.84.4 | 0.84.4 | Current — none |
| `@earendil-works/pi-coding-agent` | ^0.84.4 | 0.84.4 | Current — none |
| `@huggingface/transformers` | ^4.2.0 | 4.2.0 | Current — none |
| `yaml` | ^2.9.0 | 2.9.0 | Current — none |
| `zod` | ^4.4.3 | 4.5.4 | In-range lag; operator: no bump |
| `tsx` | ^4.23.0 | 4.23.13 | In-range lag; operator: no bump |
| `better-sqlite3` | ^12.11.1 | 13.0.3 | Major — defer #162 |
| `typescript` / `vitest` / `@types/node` | 5.x / 3.x / 22.x | 7 / 4 / 26 | Majors — defer #163 |
| `eslint` | ^8.57.1 | 10.x | Flat-config epic — defer #157 |

npm `latest` for `pi-smart-router` is currently **0.19.4** (empty bump). Prefer `npm-deprecate` restore to 0.19.3 before or after this train; do **not** “fix” with another empty bump.

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-241 | #164 | enh | M | Capture pi usage actuals + telemetry/stats | Partial → SP-242; Closes via SP-242 |
| SP-242 | #164 | enh | S | Calibrate estimateRoutingCost from rolling actuals + README | Closes #164; depends SP-241 |
| SP-243 | #165 | enh | M | Peak/off-peak adapters (Z.ai + DeepSeek) + wire into estimate/frugality | Partial → SP-244 |
| SP-244 | #165 | enh | S | Peak adapter mapper coverage + explain telemetry + README | Closes #165; depends SP-243 |
| SP-245 | #166 | enh | M | Adaptive reasoning policy module + delegation option merge | Partial → SP-246 |
| SP-246 | #166 | enh | S | Adaptive reasoning operator knobs + telemetry + README | Closes #166; depends SP-245 |

**Release scope ID:** SP-241,SP-242,SP-243,SP-244,SP-245,SP-246

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-241,SP-242,SP-243,SP-244,SP-245,SP-246
spine plan SP-241,SP-242,SP-243,SP-244,SP-245,SP-246
spine run sequence SP-241,SP-242,SP-243,SP-244,SP-245,SP-246 --dry-run
spine run sequence SP-241,SP-242,SP-243,SP-244,SP-245,SP-246
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (scope + theme)
2. `spine gate approve` per integrate wave
3. Publish approval before **exactly one** `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #164 | enh | SP-241, SP-242 | create-spine-tasks (lean) — **authored 2026-08-30** |
| #165 | enh | SP-243, SP-244 | create-spine-tasks (lean) — **authored 2026-08-30** |
| #166 | enh | SP-245, SP-246 | create-spine-tasks (lean) — **authored 2026-08-30** |

---

## Wave plan snapshot

```text
Spine plan — ids
6 task(s) · 4 wave(s) · maxParallel 3

Wave 0 · 2 tasks · 2 lanes in parallel
  Lane 1: SP-241 — Capture pi usage actuals into telemetry and stats
  Lane 2: SP-245 — Adaptive reasoning policy and delegation option merge

Wave 1 · 2 tasks · 2 lanes in parallel
  Lane 1: SP-242 — Calibrate cost estimates from rolling usage actuals
  Lane 2: SP-246 — Adaptive reasoning operator config, telemetry, and README

Wave 2 · 1 task
  Lane 1: SP-243 — Peak/off-peak pricing adapters for Z.ai and DeepSeek

Wave 3 · 1 task
  Lane 1: SP-244 — Peak pricing explain telemetry and README
```

Hot-file serialization: `routing-telemetry.ts`, `price-broker.ts`, `.pi/extensions/smart-router/delegation-runtime.ts`, `README.md`.

**Wave 1 note:** SP-242 and SP-246 both may touch `README.md` — if integrate conflicts, serialize SP-246 after SP-242 or keep README edits in SP-244/SP-246 only.

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #162 | enh (deps) | Ready | better-sqlite3 v13 — hygiene train |
| #163 | enh (deps) | Funnel | TS7 / vitest4 / @types/node26 majors |
| #157 | chore | Funnel | ESLint flat config |
| #149 | enh | Funnel | Extension public facade |
| #148 | enh | Funnel | Degraded mode when HyDRA/K4 missing |
| #147 | enh | Funnel | ONNX artifact pinning |
| #146–#143 | enh | Funnel | Telemetry/security/pipeline split cluster |
| #110 / #96 / #95 | enh | Funnel / Ready | P(success) / modernbert / shadow dogfood |
| #154 | enh | Funnel | Node engine align (Partial from SP-240) |
| #1 / #25 / #26 | epic | Parked | Hardware — physical access |
| #150–#156 | chore | Funnel | Hygiene / fragmentation |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #162 | Hygiene: better-sqlite3 v13 | Ready |
| #149 | Extension API surface cleanup | Funnel |
| #148 | Routing resilience / degraded mode | Funnel |
| #95 | Shadow dogfood vs release gates | Ready |
| #110 | Real P(success) + isotonic calibration | Funnel |
| #163 | Toolchain majors (TS7/vitest4) | Funnel |
| #157 | ESLint flat config | Funnel |

Open-issue count must **not** raise this release’s enhancement or total-task caps.

---

## Risks and blockers

- Shared economics hot path (`estimateRoutingCost` / frugality) between #164 and #165 — serialize if `spine tasks analyze` reports overlap
- Accidental `v0.19.4` still `latest` on npm — deprecate/restore before or after publish; never double-bump to “fix” latest
- Dirty tree today: `.spine/spine-config.json` modified + `.spine/reports/` untracked; main ahead of origin by 1 commit — hygiene before Phase 4
- Quota risk on kimi worker pin (doctor WARN) — monitor during batch

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave**
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD`
- [ ] `npm run release:assert-content` green
- [ ] Manifest target == expected next version (`0.19.4` + minor → `0.20.0`)
- [ ] No existing git tag `v0.20.0`
- [ ] CI green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **minor**
- [ ] **Exactly one** `npm version minor` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view` `latest` == `0.20.0` (else Publish recovery)
