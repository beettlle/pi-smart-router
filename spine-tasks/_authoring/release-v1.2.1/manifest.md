# Release manifest — v1.2.1

**Created:** 2026-10-19
**Current version:** 1.2.0 (npm `latest` 1.2.0; unpublished `1.3.0` bump was reverted in `ff28a0c`)
**Target version:** v1.2.1
**Bump type:** patch
**Profile:** patch
**Theme:** pi 1.x host compatibility — clear the pi 1.0 extension-loader warning, resolve Homebrew pi installs, and align with pi registry contracts (cost units, model limits).
**Operator approved scope:** yes (2026-10-19, including #177)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | pi 1.x host compatibility | required | PASS |
| Documentation | 0 | patch 0–2 | PASS |
| Bug fixes | 4 (#176, PR #192 merged, #175, #177) | soft 1–5 | PASS |
| Dependency hygiene | 1 (peer drift dev bump) | counts toward total | PASS |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 4 packets + PR #192 | patch ≤8 | PASS |

**Profile audit:** PASS

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
| — | PR #192 | bug | S | Homebrew libexec resolution for `resolveModelScope` | **Merged 2026-10-19** (`6ef732fe`). Review refactor reused the ancestor walk; regression test added and shown to fail without the fix. CI + Eval Harness Smoke green |
| SP-296 | #176 | bug | S | Remove host-provided `pi-ai` from `dependencies` | Closes #176 |
| SP-297 | #176 | hygiene | S | Dev pi packages → ^1.3.0 | Partial #176; depends on SP-296 |
| SP-298 | #175 | bug | S | pi registry `Model.cost` is per-1M | Closes #175 |
| SP-299 | #177 | bug | M | pi registry limits before tier defaults | Closes #177; depends on SP-297, SP-298 |

**Release scope ID:** `SP-296,SP-297,SP-298,SP-299`

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

1. ~~Approve this manifest~~ — approved 2026-10-19 (with #177)
2. `spine gate approve` per integrate wave
3. Publish approval before **exactly one** `npm version patch` (after `release:assert-content` PASS)

---

## Gaps requiring new packets

All authored 2026-10-19 (SP-296–SP-299). PR #192 handled by direct merge.

---

## Wave plan snapshot

```text
spine plan SP-296,SP-297,SP-298,SP-299 — 4 tasks · 3 waves · maxParallel 2
Wave 0: SP-296, SP-298
Wave 1: SP-297
Wave 2: SP-299
```

Expected: wave 1 = SP-296, SP-298; wave 2 = SP-297; wave 3 = SP-299.

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
| #186 | HyDRA input correctness — patch | Ready |
| #181, #179 | degenerate-output failover + main_loop policy — minor | Funnel |
| #184, #185, #187 | typed-judgment routing signals — minor | Funnel |
| #162, #163, #157 | toolchain hygiene — dedicated hygiene train | Funnel |

Open-issue count must **not** raise this release's enhancement or total-task caps.

---

## Risks and blockers

- SP-296: `provider-error.ts` (value import of `isContextOverflow` from `pi-ai`) is re-exported from `src/index.ts`. With `pi-ai` only an optional peer, a non-pi consumer importing the library root would fail to resolve it. Packet must decide: keep the optional peer (pi always provides it) or make the import lazy. `release:consumer-pack` is the gate.
- SP-297: 0.x → 1.x jump on dev deps may surface type drift; split if it exceeds S.
- Git hygiene: resolved — spine-config committed (`6f2112eb`), `.gitignore` fix (`1d2114a6`), all pushed.
- GitNexus: index rebuilt 2026-10-19, but GitNexus 1.6.8 skips dot-directories, so `.pi/extensions/**` impact checks use grep (operator-approved).

---

## Publish checklist (Phase 5–6)

- [x] All release-scoped tasks `.DONE` on `main` (SP-296–SP-299)
- [x] Post-integrate `release:check` green after **each wave** (`/tmp/pi-smart-router-post-integrate-wave-{0,1,2}.log`, exit 0, release-gates PASS)
- [x] `spine preflight` green
- [x] `npm run release:check` green on final `HEAD` (exit 0 verified, wave-2 log at `84882bac`)
- [x] `npm run release:assert-content` green (substantive delta vs `v1.2.0`)
- [x] Manifest target 1.2.1 == `package.json` 1.2.0 + patch
- [x] No existing git tag `v1.2.1` (local + origin)
- [x] CI workflow green on `HEAD` (`84882bac`, run 39696729500)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: patch
- [ ] **Exactly one** `npm version patch` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view pi-smart-router` `latest` == 1.2.1
