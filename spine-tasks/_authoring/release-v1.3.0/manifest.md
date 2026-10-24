# Release manifest — v1.3.0

**Created:** 2026-10-24
**Current version:** 1.2.1 (npm `latest` 1.2.1; v1.2.2 patch train SP-300–SP-303 built, batch `20261023T001303-b036` awaiting integrate)
**Target version:** v1.3.0
**Bump type:** minor
**Profile:** minor
**Theme:** Typed-judgment foundation (epic #183) — an opt-in, fail-open, non-deciding `typed_judgment` stage that asks a local Jev-compatible judge six typed questions per user turn and records the answers for later consumers.
**Operator exception (2026-10-24):** fourth enhancement added outside the theme — current-frontier fleet profiles for Claude 5.x and Gemini 4 (#193), approved by the operator for customer impact ("Anthropic models are widely used, and Google is catching up").
**Operator approved scope:** no — packets authored on operator request (2026-10-24); implementation waits for approval

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Typed-judgment foundation (+ operator exception #193) | required | PASS with operator override |
| Documentation | 1 (SP-309 operator docs for the shipped capability) | minor: theme docs | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs outside the in-flight v1.2.2 train: #180, #178, #186 → SP-300–SP-303; #182 is an epic) |
| Enhancements | 4 issues (#184, #185, #187 + #193) | minor 1–3 related | WARN → operator override (2026-10-24) |
| **Total tasks** | 9 packets | minor ≤15 | PASS |

**Profile audit:** PASS with operator override (enhancement cap 3 → 4 for #193; bump type stays minor — no feature-in-patch)

Waves: 4 (within minor 2–4). No dependency majors included. The override is operator-driven customer impact, not open-issue count: the epic's Sprint 2 consumers (#188–#191) and #179/#181 stay deferred.

---

## Dependency freshness (Phase 1 — required)

Inventory on 2026-10-24: `npm outdated --long`, `npm view <pkg> version`.

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | dev ^1.3.0 + peer `*` (lockfile 1.4.0) | 1.4.0 | Current |
| `@earendil-works/pi-coding-agent` | dev ^1.3.0 + peer `*` (lockfile 1.4.0) | 1.4.0 | Current |
| `@huggingface/transformers` | ^4.2.0 (4.2.0) | 4.3.1 | no bump (in-range) |
| `better-sqlite3` | ^12.11.1 | 13.0.3 | Defer #162 (major) |
| `yaml` | ^2.9.0 (2.9.0) | 2.9.1 | no bump (in-range) |
| `zod` | ^4.4.3 (4.5.4) | 4.6.7 | no bump (in-range) |
| `typescript` | ^5.8.3 (5.9.3) | 7.0.2 | Defer #163 (major) |
| `vitest` / `@vitest/coverage-v8` | ^3.2.3 (3.2.6) | 5.0.5 | Defer #163 (major) |
| `eslint` | ^8.57.1 | 10.13.0 | Defer #157 (flat config) |
| `tsx` | ^4.23.0 (4.23.12) | 4.23.15 | no bump (in-range) |
| `@types/node` | ^22.15.21 (22.20.0) | 26.6.5 | Defer #163 (major) |

No new npm dependencies: the adapter uses global `fetch` (#184).

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-304 | #184 | enh | S | TypedJudgmentPort + `typed_judgment` operator config | Partial #184 (domain port + config) |
| SP-305 | #184 | enh | M | Jev-compatible HTTP adapter + fail-closed factory | Closes #184 (with SP-304) |
| SP-306 | #185 | enh | M | Readable judge state + six-question schema + answer mapper | Closes #185 |
| SP-307 | #187 | enh | M | `typed_judgment` pipeline stage (non-deciding, fail-open) | Partial #187 (stage + order) |
| SP-308 | #187 | enh | M | Typed-judgment feature sidecar + composition-root wiring | Closes #187 (with SP-307) |
| SP-309 | #183 | doc | S | Operator docs: typed judgment setup, privacy, stage table | Partial #183 (Sprint 1 docs) |
| SP-310 | #193 | enh | S | Family rules for Claude 5.x and Gemini 4 | Partial #193 (Fable + Gemini 4 Argon off UNKNOWN_DEFAULTS) |
| SP-311 | #193 | enh | M | Benchmark grounding + aliases for Claude 5.x and Gemini 3.1/4 | Partial #193 |
| SP-312 | #193 | enh | M | Mixed capability-source fairness within a tier | Closes #193 |

**Release scope ID:** `SP-304,SP-305,SP-306,SP-307,SP-308,SP-309,SP-310,SP-311,SP-312`

### Dependency edges

| Task | Depends on | Why |
|------|-----------|-----|
| SP-304 | — | Port + config foundation |
| SP-305 | SP-304 | Implements the port; reads `typed_judgment` config |
| SP-306 | SP-304, SP-303 | Uses port question/answer wire types; `last_tool_failed` reuses the shared `isToolFailure` extracted by SP-303 (v1.2.2) |
| SP-307 | SP-304, SP-306 | Stage calls the port and the state builder / mapper; hot file `router-pipeline.ts` |
| SP-308 | SP-305, SP-307 | Wires the adapter factory into the composition root; sidecar edits in `router-pipeline.ts` after SP-307 |
| SP-309 | SP-305, SP-307 | Documents config, adapter privacy and stage order; README is not touched by SP-308 |
| SP-310 | — | `src/config/pi-model-mapper.ts` rules; disjoint from the typed-judgment files |
| SP-311 | SP-310 | Grounding and aliases on top of the new fallback tiers |
| SP-312 | SP-311 | Scale fix needs the refreshed grounded rows; same mapper file as SP-310 |

---

## Sequence runner (Phase 4)

**Precondition:** land v1.2.2 first (`spine gate approve` → `spine integrate` → `npm install` → `spine batch complete` for batch `20261023T001303-b036`, then publish or explicitly fold into this train). SP-306 depends on SP-303 and will not start before it is `.DONE` on `main`.

```bash
spine tasks validate SP-304 SP-305 SP-306 SP-307 SP-308 SP-309 SP-310 SP-311 SP-312
spine plan SP-304,SP-305,SP-306,SP-307,SP-308,SP-309,SP-310,SP-311,SP-312
spine run sequence SP-304,SP-305,SP-306,SP-307,SP-308,SP-309,SP-310,SP-311,SP-312 --dry-run
export SPINE_STET_NO_AUTO_FINISH=1
spine batch start <wave ids>    # detached
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-v130-wave-${WAVE}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Stet:** code packets append `bash scripts/spine-stet-contract-run.sh default SP-NNN` (config, security, pipeline); SP-309 is docs-only (no stet). Keep `lanes.maxParallel` at 2.

---

## Gaps requiring new packets

All three issues were gaps (no SP-* existed). Authored as SP-304–SP-309 with `create-spine-tasks` (lean).

---

## Wave plan snapshot

```text
Wave 0: SP-304, SP-310
Wave 1: SP-305, SP-306, SP-311   (SP-306 also waits on SP-303 from v1.2.2; maxParallel 2 → 2 rounds)
Wave 2: SP-307, SP-312
Wave 3: SP-308, SP-309
```

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #188, #189, #190 | enh | Ready (after this train) | Typed-judgment consumers — Sprint 2; next minor |
| #191 | eval | Funnel | Needs #188/#189 plus operator-recorded judgment cache |
| #179, #181 | enh | Ready | Deterministic glm-runaway guards (epic #182) — separate theme |
| #110, #95, #96, #167, #172 | enh/eval | Funnel | Calibration / encoder track — outside theme |
| #151 | enh | Ready | Hardware probe unit tests — hygiene train |
| #162, #163, #157, #156 | chore/deps | Ready | Toolchain majors — hygiene theme |
| #1, #25, #26 | epic | Parked | Hardware — physical access |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #188, #189 | Typed-judgment consumers: tier hints, `local_zero` gates, HyDRA requirement source (v1.4.0) | Ready |
| #190 | Same train or the next: adaptive reasoning follows `needs_deep_reasoning` | Ready |
| #179, #181 | Deep-session guards: session-depth floor, flash-class exclusion, degenerate-output failover | Ready |
| #191 | Typed judgment vs projection eval decision artifact | Funnel |
| #162, #163, #157 | Toolchain hygiene (better-sqlite3 13, TS/vitest majors, ESLint flat config) | Ready |

Open-issue count must **not** raise this release's enhancement or total-task caps.

---

## Risks and blockers

- **v1.2.2 not landed:** batch `20261023T001303-b036` (SP-300–SP-303) is built but not integrated. SP-306 needs SP-303's shared `isToolFailure`.
- **Hot files:** `src/domain/pipeline/router-pipeline.ts` (SP-307 → SP-308), `src/domain/types/schemas.ts` (SP-304 config, SP-307 stage enum, SP-308 sidecar) — serialized by dependency edges.
- **Stage enum drift:** adding `typed_judgment` to `PIPELINE_STAGE_ORDER` widens `RoutingStageSchema` and the contract JSON (`specs/001-build-smart-router/contracts/routing-decision.schema.json`). The stage never decides, but the schemas must stay in sync.
- **Strict sidecar:** `RoutingFeatureSidecarSchema` is `.strict()`; SP-308 must update entities, zod schema and the contract JSON together.
- **Privacy:** remote endpoints are fail-closed (`allow_remote` + env-only key). No prompt or state text in logs or telemetry.
- **Byte-identical default:** with `typed_judgment.enabled: false` (default) routing decisions must match current fixtures. (Does not apply to #193 — SP-310–SP-312 intentionally change fleet capabilities.)
- **#193 behavior change:** Fable and Gemini 4 Argon move from economical/unknown to frontier, and SP-312 rescales grounded capabilities. Corpus smoke + release-gate report before/after are required in SP-312 STATUS.
- **#193 leaderboard coverage:** new models may not be on all four leaderboards yet; ungrounded ids stay on pattern defaults and are listed in provenance. Live fetch needs network; scores are never invented.
- **#193 tier choices:** Fable → frontier and Gemini 4 Argon → frontier are operator-visible defaults; confirm at scope approval.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] `npm run release:assert-content` green (substantive delta vs last release tag)
- [ ] Manifest target == expected next version from `package.json` + bump type
- [ ] No existing git tag `v1.3.0`
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: minor
- [ ] **Exactly one** `npm version minor` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view` `latest` == 1.3.0 (else Publish recovery, do not re-bump)
