# Release manifest — v{TARGET_VERSION}

**Created:** {YYYY-MM-DD}
**Current version:** {from package.json}
**Target version:** v{TARGET_VERSION}
**Bump type:** patch | minor | major
**Profile:** patch | minor | major
**Theme:** {one sentence — required}
**Operator approved scope:** no | yes ({date})

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | {sentence} | required | PASS / FAIL |
| Documentation | {n} | patch 0–2 / minor theme docs | PASS / WARN |
| Bug fixes | {n} | soft; 0 OK if none open | PASS / PASS (no open bugs) / WARN |
| Enhancements | {n} | patch **0** / minor 1–3 related | PASS / FAIL |
| **Total tasks** | {n} | patch ≤8 / minor ≤15 | PASS / WARN |

**Profile audit:** PASS | PASS with operator override (caps only) | FAIL (do not proceed)

**Hygiene (patch only, if any):** {one-line justification or "none"}

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-### | #NNN | doc / bug / enh | S/M | … | Closes / Partial |

**Release scope ID:** comma-separated SP-IDs for `spine plan`, `spine batch start`, and `spine run sequence` (e.g. `SP-196,SP-197,SP-199`). No spaces.

---

## Sequence runner (Phase 4)

The manifest is the operator contract; the CLI takes the **scope ID string**, not the manifest file path.

```bash
spine tasks validate <SP-IDs...>
spine plan <release-scope-id>
spine run sequence <release-scope-id> --dry-run
spine run sequence <release-scope-id>    # detached — omit --attached
```

Per-wave manual loop (alternative to full sequence):

```bash
spine batch start <release-scope-id> --wave N
spine status --diagnose
spine gate approve && spine integrate && npm install && spine batch complete
```

**Regression gate** (after each integrate, before next wave):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

Do **not** use `| tail` alone for pass/fail — verify exit code.

**Operator gates** (human only):

1. Approve this manifest (operator sign-off on scope + theme)
2. `spine gate approve` per integrate wave
3. Publish approval before `npm version <bump>`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #90 | doc | SP-### | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
(paste output of: spine plan <release-scope>)
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| SP-### / #NNN | enh | Outside theme; defer to next minor |
| #1 / #25 / #26 | epic | Hardware — blocked on physical access |

---

## Risks and blockers

- {e.g. hot-file serialization on router-pipeline.ts}
- {e.g. release:check flaky assert — fix before tag}

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: patch | minor | major (matches Phase 2)
- [ ] `npm version <bump>` + `git push && git push --tags`
- [ ] `release.yml` succeeded; `npm view pi-smart-router version` matches target
