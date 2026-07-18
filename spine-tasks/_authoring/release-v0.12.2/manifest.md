# Release manifest — v0.12.2

**Created:** 2026-07-16
**Current version:** 0.12.1
**Target version:** v0.12.2
**Bump type:** patch
**Profile:** patch
**Theme:** Hotfix — extension failed to load on Pi ≥ 0.80.8 (`AuthStorage` removed → `AuthStorage.create()` threw at load → `smart-router/auto` never registered). Re-bootstrap placeholder registry via `ModelRuntime.create()` + `new ModelRegistry(...)`; align deps to 0.80.10.
**Operator approved scope:** yes (2026-07-16 — hotfix + dogfood QA tooling included)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Extension load breakage on Pi 0.80.8+ | required | PASS |
| Documentation | 1 (README — path-package/dogfood install + post-publish smoke) | patch 0–2 | PASS |
| Bug fixes | 1 (extension bootstrap) | soft | PASS |
| Enhancements | 0 | patch **0** (hard) | PASS |
| **Total tasks** | 0 SP packets (out-of-band hotfix) | patch ≤8 | PASS |

**Profile audit:** PASS

**Hygiene (patch only):** dogfood QA helper scripts (`scripts/qa/*` + 3 `package.json` entries) ride along — read-only export/gather tooling, zero routing/pin/gate/default changes. Operator approved 2026-07-16.

---

## Root cause / fix (from engineering)

**Root cause:** Pi removed the public `AuthStorage` export and the old
`ModelRegistry.inMemory(authStorage)` / `ModelRegistry.create(authStorage)` factories. The extension
still called `AuthStorage.create()` at load time, so `AuthStorage` was `undefined` and `.create` threw.
Because the extension never finished loading, the `smart-router/auto` provider was never registered.

**Fix:** Bootstrap the pre-session placeholder registry with the new API:

- `await ModelRuntime.create()`
- `new ModelRegistry(modelRuntime)`

Session/command binding of Pi's shared `ctx.modelRegistry` (SP-087) is unchanged. Raised
`pi.minPiVersion` to **0.80.8** and aligned `@earendil-works/pi-coding-agent` /
`@earendil-works/pi-ai` to **0.80.10**.

**User impact:** on Pi 0.80.8+, the extension failed to load and `smart-router` was missing from
`/scoped-models`, `/model`, and `/smart-router` commands. After 0.12.2 the provider registers normally.

---

## Composition (direct working-tree change — no SP packet)

| File | Change | Notes |
|------|--------|-------|
| `.pi/extensions/smart-router/extension-setup.ts` | `AuthStorage.create()`+`ModelRegistry.inMemory` → `ModelRuntime.create()`+`new ModelRegistry` | core fix |
| `tests/unit/extension-setup-bootstrap.test.ts` | new bootstrap test | asserts no `AuthStorage`, uses `ModelRuntime.create` + `new ModelRegistry` |
| `package.json` | `pi-ai` `*`→`^0.80.10`; `pi-coding-agent` `^0.80.3`→`^0.80.10`; `minPiVersion` `0.80.0`→`0.80.8`; +3 `qa:*` scripts | dep alignment |
| `package-lock.json` | lockfile refreshed | pi-ai/pi-coding-agent/pi-agent-core/pi-tui → 0.80.10 |
| `README.md` | path-package install + post-publish smoke notes | docs |
| `scripts/qa/count-labeled-econ.ts`, `dogfood-gather.sh`, `export-dogfood-snapshot.ts` | new dogfood QA helpers | ride-along tooling |

**Release scope ID:** _(none — direct patch, no spine batch)_

---

## Sequence runner (Phase 4)

Not applicable — out-of-band hotfix composed directly in the working tree (no SP packets to plan/run).
Skipped `spine tasks validate` / `spine plan` / `spine batch start`.

**Regression gate** (pre-commit, on working tree):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-v0122-precommit.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates** (human only):

1. Approve this manifest (operator sign-off on scope + theme) — approved 2026-07-16
2. _(no integrate wave — direct commit)_
3. Publish approval before `npm version patch`

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #122, #121 | bug | Routing bugs; not load-blocking; defer to next patch |
| #115–#117, #119–#120, #123, #124 | enh | Post-dogfood enhancements; outside hotfix scope |
| #95 | human QA | Shadow dogfood; needs healthy build (this hotfix unblocks it) |
| #1 / #25 / #26 | epic | Hardware |

---

## Risks and blockers

- Must **not** change routing decisions, frugality, absolute gates, or encoder defaults. (Confirmed: only the bootstrap registry construction changed; SP-087 `ctx.modelRegistry` binding untouched.)
- `minPiVersion` bump to 0.80.8 is required — older Pi can no longer load this extension. Documented in README.
- GitNexus does not index `.pi/extensions/`; blast-radius for the fix is covered by the new bootstrap unit test, not the graph.

---

## Publish checklist (Phase 5–6)

- [ ] `npm run release:check` green on working tree (`/tmp/pi-smart-router-v0122-precommit.log`; exit 0 verified)
- [ ] `detect_changes` reviewed — low risk, 0 affected execution flows (only README sections in indexed scope)
- [ ] Commit on `main` (or PR → merge)
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **patch** (2026-07-16)
- [ ] `npm version patch` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` returns `0.12.2`
