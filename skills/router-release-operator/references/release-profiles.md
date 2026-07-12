# Release profiles (pi-smart-router)

Use at **Phase 2** after parsing the operator's target version. Compare `package.json` version to the target to derive bump type.

These budgets **replace** pi-spine `spine-release-operator` profile math for this repo. Batch land / publish mechanics still follow spine-release-operator or spine-autonomous-operator.

## Derive bump type

| Current → Target | Bump type | Profile |
|------------------|-----------|---------|
| `0.9.3` → `0.9.4` | **patch** | `patch` |
| `0.9.3` → `0.10.0` | **minor** | `minor` |
| `0.10.0` → `1.0.0` | **major** | `major` |

If the operator says only `patch` / `minor` / `major` without a version, compute the next version from `package.json` and record both in the manifest.

## Invocation parsing

| Operator says | Profile |
|---------------|---------|
| "release for v0.9.4", "patch release", "hotfix release" | `patch` |
| "release for v0.10.0", "minor release", "feature release" | `minor` |
| "release for v1.0.0", "major release", "breaking release" | `major` |
| "run a router release cycle" (no version) | **Ask** operator for target version or bump type |

## Theme (all profiles)

Every release **requires** a one-sentence **theme** in the manifest (e.g. "Dogfood routing fixes", "Eval corpora & community bench", "Stability hotfix").

- Selected issues/tasks must **complete or clearly serve** that theme.
- Prefer **sibling clusters** that finish the theme over thin single-issue versions.
- Theme missing or selected work contradicts the theme → **FAIL** (do not proceed).

## Profile budgets

### Patch (`patch`)

Stability and correctness only. No new capability.

| Bucket | Target | Hard limits |
|--------|--------|-------------|
| Theme | Required (stability / hotfix) | Must match selected work |
| Documentation | 0–2 clarifications | No new feature docs; defer large doc epics |
| Bug fixes | Soft target 1–5 high-impact | Include open high-impact bugs that fit the cap; **0 OK** when none open |
| Enhancements | **0** | **Hard fail** if any enhancement included — reclassify as minor or drop |
| Total tasks | **≤8** | WARN if >8; proceed only with operator override that keeps bump type honest |
| Max waves | 1–2 | Prefer single wave when possible |
| Task sizes | S preferred; M OK | M allowed only for bug-fix decomposition with disjoint scope; split L/XL |

**Hygiene exception (patch only):** non-user-facing fixes (typo, flake clock, lint-only) allowed with a **one-line justification** in the manifest. Still **no** new capability.

**Defer by default:** all enhancements, roadmap items, eval/infra features, epics, hardware.

### Minor (`minor`)

One capability theme plus related stability work.

| Bucket | Target | Hard limits |
|--------|--------|-------------|
| Theme | Required (capability name) | Sibling issues that complete the theme preferred |
| Documentation | Docs for the theme | Include operator-facing docs for shipped capability |
| Bug fixes | Open high-impact that fit | Soft; **0 OK** when no open bugs (`PASS (no open bugs)`) |
| Enhancements | **1–3 related** issues | Must serve the theme; defer unrelated P2/P3 |
| Total tasks | **≤15** | WARN if >15 without override |
| Max waves | 2–4 | ≤4 M-sized tasks per wave |
| Task sizes | S/M | Split L/XL before inclusion |

**Defer by default:** unrelated roadmap slices, hardware epics, work needing >4 waves.

**Priority among enhancements:** prefer [`docs/routing-roadmap.md`](../../../docs/routing-roadmap.md) P0/P1 dogfood over P3 eval when choosing what completes the theme.

### Major (`major`)

Breaking changes and large migrations (e.g. 1.0 readiness). Operator-defined epic scope.

| Bucket | Target | Hard limits |
|--------|--------|-------------|
| Theme | Required (breaking / 1.0) | Explicit epic boundaries in manifest |
| Documentation | Migration guides + comprehensive pass | Required for breaking changes |
| Bug fixes | Critical blockers | Prioritize regressions blocking migration |
| Enhancements | Multiple allowed | Breaking API changes OK with migration path |
| Total tasks | Operator-defined | Manifest must list epic boundaries |
| Max waves | Planned in manifest | Expect multi-cycle execution |

**Require:** explicit operator approval of epic scope before Phase 3. Do not auto-select major scope from backlog alone.

## Selection order (all profiles)

Apply in this order; stop when profile budget is full:

1. **Documentation** — `label:documentation`, README/operator-guide clarifications fitting the theme
2. **Bug fixes** — open `label:bug` with user impact; prefer already-tasked or quick S/M
3. **Enhancements** — **minor/major only**; only theme-completing related issues
4. **Defer** everything else with one-line rationale

## Profile audit (must pass before Phase 3)

| Check | Patch | Minor | Major |
|-------|-------|-------|-------|
| Theme present and coherent | Required | Required | Required |
| Enhancement count | **>0 → FAIL** (reclassify or drop) | >3 without override → WARN | — |
| Bug count | 0 + no open bugs → **PASS (no open bugs)**; open bugs skipped without deferral → WARN | Same | Critical blockers skipped → WARN |
| Total tasks | >8 → WARN | >15 → WARN | — |
| M/L in patch | L/XL → split; M only for bug-fix decomposition | — | — |
| Bump type vs content | Features in scope → must be **minor**, not patch OVERRIDE | — | — |

**Do not** use OVERRIDE to ship enhancements as patch. Change bump type to minor or drop the enhancement.

Record `Profile audit: PASS` or `PASS with operator override` (caps/waves only; never for feature-in-patch) before proceeding.

## Version ↔ publish alignment

The bump type chosen in Phase 2 must match `npm version` in Phase 6:

- `patch` profile → `npm version patch`
- `minor` profile → `npm version minor`
- `major` profile → `npm version major`

If the operator changes bump type at publish gate, update the manifest and confirm scope still fits the new profile.

## Sanity checks (read-through)

| Proposal | Result |
|----------|--------|
| Ship #106 + #107 as **patch** | **FAIL** — enhancements; recommend **minor** with theme e.g. "TwinRouterBench fit & CI track" |
| Hotfix only open bugs as **patch**, theme "Stability hotfix" | **PASS** |
| Feature-only minor, 0 open bugs, theme "Live leaderboard ingest" | **PASS (no open bugs)** |
