---
name: router-release-operator
description: >-
  End-to-end pi-smart-router release operator. Intakes GitHub issues and pending
  spine tasks, composes a themed semver-profiled release (patch = docs+bugs only;
  enhancements require minor), authors/audits packets, executes waves, and
  publishes after operator approval. Use when asked to run a router release,
  release vX.Y.Z, patch/minor/major for pi-smart-router, or ship to npm.
disable-model-invocation: true
compatibility: Requires gh CLI, spine CLI, git, Node >= 20. Run from pi-smart-router repo root on main.
---

# Router Release Operator

You are the **pi-smart-router release operator**. Drive a **curated, themed release** from intake through publish: select work by **local** semver profiles, author/audit packets, execute batches, verify, and bump version — with **operator approval** before publish.

Invoke explicitly: `/skill:router-release-operator` or "release v0.10.0" / "patch release" / "minor release".

**Not** for executing all pending tasks or open-ended backlog cycles — use [`router-backlog-orchestrator`](../router-backlog-orchestrator/SKILL.md) for development cycles. This skill selects a **subset** fitting the release profile and theme.

## Skill boundaries

| Concern | Delegate to |
|---------|-------------|
| Semver scope budgets / theme audit | [references/release-profiles.md](references/release-profiles.md) (**this repo — not pi-spine**) |
| Issue intake | [references/issue-intake-checklist.md](references/issue-intake-checklist.md) |
| Manifest format | [references/release-manifest-template.md](references/release-manifest-template.md) |
| PROMPT/STATUS/Contract authoring | `create-spine-tasks` + [packet-from-issue.md](../router-backlog-orchestrator/references/packet-from-issue.md) |
| Batch land / recovery / detached policy | pi-spine `spine-release-operator` Phase 4+ **or** `spine-autonomous-operator` + [`.cursor/rules/spine-operator-cursor.mdc`](../../.cursor/rules/spine-operator-cursor.mdc) |
| Cycle triage (docs → bugs → features) | [`router-backlog-orchestrator`](../router-backlog-orchestrator/SKILL.md) — hand off **here** when operator asks for a versioned release |

## Success criteria

1. Release manifest written with **theme** and operator-approved scope
2. Profile audit **PASS** (or PASS with cap override only — never feature-in-patch OVERRIDE)
3. All **release-scoped** tasks `.DONE` and integrated on `main`
4. `spine preflight` green; **`npm run release:check` green (blocking)** on current `main`
5. **CI workflow green on `HEAD`** before tag push
6. Operator explicitly approved publish; **exactly one** version bump to the manifest target; tag pushed (if approved)
7. Final report with theme, composition table, deferred backlog, **next-train slate**, verification output

## Hard rules

- **Never** hand-edit `.spine/batch-state.json` or `.spine/runtime/**`
- **Never** ship enhancements in a **patch** — reclassify as **minor** or drop (no OVERRIDE theater)
- **Never** omit the release **theme** or select work that contradicts it
- **Never** treat empty open-bug queue as audit failure — use `PASS (no open bugs)`
- **Never** raise profile caps because the open-issue count grew (**anti-feature-magnet**) — ship more trains or defer via intake
- **Never** run `npm version` or `git push --tags` without explicit operator approval
- **Never** run `npm version` / tag push when `npm run release:check` exits non-zero on current `main`
- **Never** run `npm version` / tag push when CI is not green on current `HEAD`
- **Never** run `npm version` / tag push when `npm run release:assert-content` exits non-zero (empty/contentless delta vs last release tag)
- **Never** run a **second** `npm version` in the same publish session — one bump per approved manifest target; **STOP** after successful tag push
- **Never** “fix” a wrong `latest` dist-tag with another bump — use Publish recovery (deprecate workflow)
- **Always** parse target version / bump type **before** task selection (Phase 2)
- **Always** use [references/release-profiles.md](references/release-profiles.md) for budgets (not pi-spine profiles)
- **Always** prioritize documentation before enhancements within the theme
- **Always** run `spine gate approve` before `spine integrate`
- **Always** run `npm install` on `main` after successful integrate
- **Always** run post-integrate `npm run release:check` on `main` after each wave before the next wave or push
- **Never** judge `release:check` from `| tail` / `| head` alone — verify exit code
- **Do not** execute tasks outside the approved manifest scope
- **Do not** start a second batch while another is **running** on this repo
- **Release batches:** prefer detached `spine batch start|resume` (omit `--attached`); see spine-operator rules

---

## Pre-work — GitNexus index (recommended)

```bash
cd <repo-root>
# Prefer: node .gitnexus/run.cjs analyze   OR   npx gitnexus analyze
gitnexus status   # when available — Status up-to-date with HEAD
```

If analyze fails, report and continue only if operator accepts stale index risk.

---

## Phase 0 — Baseline and target version

```bash
cd <repo-root>    # pi-smart-router root
spine --version && spine doctor
node -p "require('./package.json').version"
git status
git branch --show-current   # must be main
```

**Parse invocation** for target version or bump type — see [release-profiles.md](references/release-profiles.md).

If not on `main`, stop. If git is dirty, commit or stash hygiene before release work.

---

## Phase 1 — Intake inventory

Follow [references/issue-intake-checklist.md](references/issue-intake-checklist.md).

**GitHub** (`beettlle/pi-smart-router` only):

```bash
gh issue list --repo beettlle/pi-smart-router --state open --limit 100 \
  --json number,title,labels,body
```

**Pending tasks:**

```bash
spine plan pending
spine tasks validate pending
spine tasks analyze pending
rg 'GitHub: beettlle/pi-smart-router#|Closes:|Partial:' spine-tasks/*/PROMPT.md
```

Read `spine-tasks/CONTEXT.md` for `Next Task ID`. Skim `docs/routing-roadmap.md` for enhancement priority.

**Output:** intake table (issue #, labels, mapped SP-* or gap, bucket, theme fit, profile fit).

---

## Phase 2 — Compose release manifest

Write:

```
spine-tasks/_authoring/release-v{TARGET}/manifest.md
```

Use [references/release-manifest-template.md](references/release-manifest-template.md).

### Selection order (strict)

1. State the **theme** (one sentence)
2. **Documentation** fitting the theme
3. **Bug fixes** (all high-impact that fit the cap; 0 OK)
4. **Enhancements** — only if profile is minor/major; 1–3 related issues completing the theme
5. **Defer** everything else with one-line rationale

Apply [release-profiles.md](references/release-profiles.md) budgets. **FAIL** if enhancements appear under patch — ask operator to bump to minor or drop features.

### Operator gate

Present:

- Target version, profile, **theme**
- Selected SP-* / issues by bucket
- Deferred count + reasons
- Profile audit status

Require explicit **"approve release scope"** before Phase 3.

---

## Phase 3 — Author gaps and audit packets

### 3.1 Author new tasks (gaps only)

For issues in manifest without SP-*:

- Follow `create-spine-tasks` (lean) + [packet-from-issue.md](../router-backlog-orchestrator/references/packet-from-issue.md)
- Link GitHub in `## Source`; Mission `Closes: #NNN` or `Partial:`
- Size S/M; ≤4 impl steps; Contract + Testing step
- Update `dependencies.json`, `CONTEXT.md`, `Next Task ID`
- Serialize hot files: `.pi/extensions/smart-router/index.ts`, `src/domain/pipeline/router-pipeline.ts`, `src/api/middleware/pi-router-middleware.ts`

### 3.2 Audit release-scoped packets

| Size | Action |
|------|--------|
| **S** | Keep if ≤4 impl steps |
| **M** | OK if disjoint; in patch only for bug-fix decomposition |
| **L/XL** | **Split** before inclusion |

```bash
spine tasks validate <release-scope>
spine tasks analyze <release-scope>
spine plan <release-scope>
```

### 3.3 Commit packet changes

```bash
git add spine-tasks/
git commit -m "chore(spine): release v{TARGET} task packets"
```

---

## Phase 4 — Execute release scope

Delegate wave start / monitor / land / recovery to pi-spine **spine-release-operator** Phase 4 (or spine-autonomous-operator) with these **repo-specific** gates:

**Scope:** manifest tasks only — comma-separated release scope ID list.

```bash
spine preflight
spine run sequence <release-scope> --dry-run
```

For each wave until release-scoped tasks are `.DONE`:

1. Detached `spine batch start <release-scope> --wave N` (omit `--attached` unless persistent interactive terminal)
2. `spine status --diagnose` / `spine wait`
3. Land: `spine gate approve` → `spine integrate` → `npm install` → `spine batch complete`
4. **Post-integrate regression gate (blocking):**

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${N}.log
test "${PIPESTATUS[0]}" -eq 0
```

Do **not** start wave N+1, push, or publish until exit 0. Fix on `main` and re-run if failed.

Wave sizing: ≤4 M-sized tasks per wave; serialize hot shared files.

---

## Phase 5 — Pre-publish verification (STOP)

```bash
spine plan <release-scope>    # 0 pending for scope
spine preflight
npm run release:check 2>&1 | tee /tmp/pi-smart-router-release-check.log
test "${PIPESTATUS[0]}" -eq 0
```

**If non-zero:** STOP. Fix on `main`, re-run Phase 5. Do not ask for publish approval.

Present checklist (only after exit 0):

- [ ] All release-scoped tasks done
- [ ] Theme + profile audit still accurate
- [ ] `npm run release:check` exit 0
- [ ] `npm run release:assert-content` exit 0 (vs last release tag)
- [ ] CI green on `HEAD` (`gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)"`)
- [ ] Clean git tree
- [ ] Bump type matches Phase 2 profile
- [ ] Manifest target version equals expected next version from `package.json` + bump type
- [ ] No git tag `v{TARGET}` already exists

**Human gate:** do not bump or push until operator approves publish **and** Phase 5 passed.

---

## Phase 6 — Publish (after approval only)

**Prerequisites:** Phase 5 `release:check` exit 0; `release:assert-content` exit 0; CI green on `HEAD`; operator said approve publish + confirmed bump type; manifest target matches expected next version.

### 6.1 Pre-bump gates (blocking)

```bash
COMMIT=$(git rev-parse HEAD)
CURRENT=$(node -p "require('./package.json').version")
# TARGET from spine-tasks/_authoring/release-v{TARGET}/manifest.md (no leading v)
# BUMP = patch | minor | major from Phase 2 — must match manifest

gh run list --workflow ci.yml --commit "$COMMIT" --json databaseId,conclusion,status --limit 5
# Fail closed unless conclusion: success

npm run release:assert-content
test $? -eq 0

# Expected next version must equal manifest TARGET (use node semver or manual check).
# Fail if git tag v${TARGET} already exists:
git rev-parse -q --verify "refs/tags/v${TARGET}" && echo "FAIL: tag exists" && exit 1
```

### 6.2 Single-shot bump (exactly once)

```bash
npm version "$BUMP"   # patch | minor | major — must match Phase 2; produces one commit + one tag
# Verify package.json version == TARGET before push:
node -p "require('./package.json').version"   # must print TARGET

git push && git push --tags
# STOP here. Do NOT run npm version again in this session.
```

### 6.3 Watch publish + verify latest

```bash
gh run list --workflow release.yml --limit 3
# Wait for success on tag v${TARGET}

npm view pi-smart-router version
npm view pi-smart-router dist-tags --json
# latest MUST equal TARGET. If not: STOP — do not bump again; use Publish recovery.
```

Update `spine-tasks/CONTEXT.md` release note. Close GitHub issues where acceptance was met (`Closes:`).

### Publish recovery (empty / wrong latest)

When an accidental empty bump was published (e.g. `0.19.0`, `0.19.4`) or `latest` points at the wrong version:

1. **Prefer CI** (local `npm whoami` often lacks publish rights): run workflow **`npm-deprecate`** (`.github/workflows/npm-deprecate.yml`) with:
   - `version`: bad version (e.g. `0.19.4`)
   - `message`: short deprecate reason
   - `restore_latest`: good version (e.g. `0.19.3`) when `latest` must move back
2. **Local only** if `npm whoami` prints the package owner (`beettlle`):

```bash
npm deprecate "pi-smart-router@${BAD}" "${MESSAGE}"
npm dist-tag add "pi-smart-router@${GOOD}" latest   # when restoring latest
```

Do **not** fix a bad publish by running another `npm version` without a new themed release and new operator approval.

**Operator follow-up (current debt):** after this skill lands, dispatch `npm-deprecate` for `0.19.4` with `restore_latest=0.19.3`.

---

## Final report (required)

1. Manifest path, target version, profile, **theme**, composition table
2. Tasks completed — SP-IDs, waves, issues closed
3. Deferred backlog — count and top items
4. **Next-train slate** — 3–7 deferred issues with candidate themes (Ready / Funnel / Parked); open-issue count must **not** raise profile caps
5. Profile audit result (no feature-in-patch OVERRIDE)
6. Verification — `release:check` + `release:assert-content` log paths / exit codes; CI run URL
7. Publish — single bump (Y/N), tag, workflow URL, `npm view` latest == target, or awaiting approval / recovery

## Repo-specific notes

| Item | Value |
|------|-------|
| Tasks root | `spine-tasks/` |
| Issues repo | `beettlle/pi-smart-router` |
| Profiles | `skills/router-release-operator/references/release-profiles.md` |
| Pre-publish gate | `npm run release:check` |
| Content gate | `npm run release:assert-content` |
| Publish | Tag-triggered `.github/workflows/release.yml` |
| Deprecate recovery | `.github/workflows/npm-deprecate.yml` |

## Short prompt (resume mid-release)

```text
Resume router release v{TARGET}: check manifest at
spine-tasks/_authoring/release-v{TARGET}/manifest.md (theme + profile audit) →
spine status --diagnose → preflight → for each wave: batch start → diagnose →
gate approve → integrate → npm install → batch complete →
post-integrate release:check (exit 0) → final release:check → release:assert-content →
CI green on HEAD → STOP for publish approval → single npm version (once) →
push tags → verify npm latest == TARGET → STOP (no second bump).
Post final report with theme, composition table, and next-train slate.
```
