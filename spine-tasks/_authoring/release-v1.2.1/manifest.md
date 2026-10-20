# Release manifest — v1.2.1

**Created:** 2026-10-19
**Current version:** 1.2.0 (npm `latest` 1.2.0; unpublished `1.3.0` bump was reverted in `ff28a0c`)
**Target version:** v1.2.1
**Bump type:** patch
**Profile:** patch
**Theme:** pi 1.x host compatibility — clear the pi 1.0 extension-loader warning, resolve Homebrew pi installs, and align with pi registry contracts (cost units, model limits).
**Operator approved scope:** no

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | pi 1.x host compatibility | required | PASS |
| Documentation | 0 | patch 0–2 | PASS |
| Bug fixes | 3 core (#176, PR #192, #175) + 1 optional (#177) | soft 1–5 | PASS |
| Dependency hygiene | 1 (peer drift dev bump) | counts toward total | PASS |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 4 core / 5 with optional | patch ≤8 | PASS |

**Profile audit:** PASS (pending operator scope approval)

**Hygiene (patch only):** SP-297 bumps dev-only `@earendil-works/pi-ai` / `pi-coding-agent` from ^0.85.1 to ^1.3.0 so typecheck and tests run against the pi version users have installed. No runtime capability change.

---

## Dependency freshness (Phase 1 — required)

Inventory on 2026-10-19: `npm outdated --long`, `npm view @earendil-works/pi-ai version` (1.3.0), `npm view @earendil-works/pi-coding-agent version` (1.3.0).

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | deps ^0.85.1 + peer `*` (optional) | 1.3.0 | **Include SP-296** (remove from `dependencies`) + **Include SP-297** (dev ^1.3.0) |
| `@earendil-works/pi-coding-agent` | dev ^0.85.1 + peer `*` (optional) | 1.3.0 | **Include SP-297** (dev ^1.3.0) |
| `@huggingface/transformers` | ^4.2.0 | 4.3.1 | no bump (in-range) |
| `better-sqlite3` | ^12.11.1 | 13.0.3 | Defer #162 (major) |
| `yaml` | ^2.9.0 | 2.9.1 | no bump (in-range) |
| `zod` | ^4.4.3 | 4.6.7 | no bump (in-range) |
| `typescript` | ^5.8.3 | 7.0.2 | Defer #163 (major) |
| `vitest` / `@vitest/coverage-v8` | ^3.2.3 | 5.0.5 | Defer #163 (major) |
| `eslint` | ^8.57.1 | 10.13.0 | Defer #157 (major / flat config) |
| `tsx` | ^4.23.0 | 4.23.15 | no bump (in-range) |
| `@types/node` | ^22.15.21 | 26.6.5 | Defer #163 (major) |
| `@types/better-sqlite3` | ^7.6.13 | 9.6.0 | Defer #162 (major) |

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-296 | #176 | bug | S | Remove host-provided `pi-ai` from `dependencies` | Closes #176. Keep peer `*`; add to devDependencies; unit test asserting no host-provided package (`pi-ai`, `pi-coding-agent`, `pi-tui`, `typebox`) in `dependencies`; `release:consumer-pack` must stay green; confirm CLI (`bin/pi-smart-router.mjs`) import graph does not pull `provider-error.ts` → `pi-ai` |
| SP-297 | #176 | hygiene | S | Dev peer bump `pi-ai` / `pi-coding-agent` → ^1.3.0 | Partial #176. Depends on SP-296. `/compat` subpath still exported in 1.3.0; fix typecheck drift if any; keep `pi.minPiVersion` unless an API requires raising it |
| SP-298 | PR #192 | bug | S | Homebrew libexec resolution for `resolveModelScope` | Merge PR #192 (contributor credit), then add unit test for the `<ancestor>/libexec/lib/node_modules/@earendil-works/pi-coding-agent` candidate. PR has no tests and repo `ci.yml` has not run on it (only GitGuardian) |
| SP-299 | #175 | bug | S | pi registry `Model.cost` is per-1M, not per-token | Closes #175. Drop `* 1_000_000` in `deriveFallbackCostPer1M`; treat negative rates as unknown; fix per-token fixtures in `pi-model-mapper.test.ts` and `smart-router-pricing.test.ts` |
| SP-300 *(optional)* | #177 | bug | M | pi registry limits before tier defaults | Closes #177. YAML → LiteLLM → pi registry → tier default in `resolveLimits`; registry limits passed at fleet bootstrap. Child of epic #182 |

**Release scope ID (core):** `SP-296,SP-297,SP-298,SP-299`
**Release scope ID (with optional):** `SP-296,SP-297,SP-298,SP-299,SP-300`

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-296 SP-297 SP-298 SP-299
spine plan SP-296,SP-297,SP-298,SP-299
spine run sequence SP-296,SP-297,SP-298,SP-299 --dry-run
spine run sequence SP-296,SP-297,SP-298,SP-299    # detached — omit --attached
```

**Regression gate** (after each integrate, before next wave):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates** (human only):

1. Approve this manifest (scope + theme; decide on optional SP-300)
2. `spine gate approve` per integrate wave
3. Publish approval before **exactly one** `npm version patch` (after `release:assert-content` PASS)

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #176 | bug | SP-296 | create-spine-tasks (lean) |
| #176 | hygiene | SP-297 | create-spine-tasks (lean) |
| PR #192 | bug | SP-298 | merge PR + create-spine-tasks (test only) |
| #175 | bug | SP-299 | create-spine-tasks (lean) |
| #177 | bug | SP-300 (optional) | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
(pending — run after packets are authored: spine plan <release-scope>)
```

Expected: wave 1 = SP-296, SP-298, SP-299 (disjoint files); wave 2 = SP-297 (shares `package.json` / lockfile with SP-296) [+ SP-300].

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #180, #178 | bug | Ready | Cross-provider delegation / context-fit hardening — epic #182 theme, not pi-1.x compat |
| #181, #179 | enh | Funnel | Enhancements — not allowed in patch |
| #182 | epic | Funnel | Tracking epic; children split across trains |
| #186 | bug (P2) | Ready | HyDRA loop flag — unrelated to theme |
| #183–#185, #187–#191 | enh | Funnel | Typed-judgment epic — minor/major scope |
| #110, #95, #96, #167, #172, #151 | enh | Funnel | Routing/eval enhancements — minor scope |
| #162, #163, #157, #156 | chore/deps | Funnel | Toolchain majors / hygiene theme |
| #1, #25, #26 | epic | Parked | Hardware — needs physical access |

## Next-train slate

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #180 | glm runaway hardening (epic #182) — patch | Ready |
| #178 | glm runaway hardening (epic #182) — patch | Ready |
| #177 (if not taken here) | glm runaway hardening (epic #182) — patch | Ready |
| #186 | HyDRA input correctness — patch | Ready |
| #181, #179 | degenerate-output failover + main_loop policy — minor | Funnel |
| #184, #185, #187 | typed-judgment routing signals — minor | Funnel |
| #162, #163, #157 | toolchain hygiene — dedicated hygiene train | Funnel |

Open-issue count must **not** raise this release's enhancement or total-task caps.

---

## Risks and blockers

- SP-296: `provider-error.ts` (value import of `isContextOverflow` from `pi-ai`) is re-exported from `src/index.ts`. With `pi-ai` only an optional peer, a non-pi consumer importing the library root would fail to resolve it. Packet must decide: keep the optional peer (pi always provides it) or make the import lazy. `release:consumer-pack` is the gate.
- SP-297: 0.x → 1.x jump on dev deps may surface type drift; split if it exceeds S.
- SP-298: PR #192 from a fork; `ci.yml` has not run on it.
- Git hygiene: `.spine/spine-config.json` is modified and `main` is 1 commit ahead of `origin/main` — resolve before Phase 3.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] `npm run release:assert-content` green (substantive delta vs `v1.2.0`)
- [ ] Manifest target 1.2.1 == `package.json` 1.2.0 + patch
- [ ] No existing git tag `v1.2.1`
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: patch
- [ ] **Exactly one** `npm version patch` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view pi-smart-router` `latest` == 1.2.1
