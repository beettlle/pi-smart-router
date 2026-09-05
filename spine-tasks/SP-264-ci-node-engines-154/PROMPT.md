# Task: SP-264 — ci node engines 154

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Pin CI Node to engines floor and document prerequisites.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#154
- Bucket: feature
- Closes: #154
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Closes #154 — finish Node engine honesty after `engines.node` already `>=22.19.0`:

1. Pin GitHub Actions `node-version` to `22.19.0` (or documented LTS ≥22.19) across release-critical workflows (`ci.yml`, `release.yml`, calibration/eval as touched).
2. Add README prerequisites note for engine-strict / Node ≥22.19.0.
3. Verify `npm ci` path documents no EBADENGINE on supported Node.
4. Do **not** bump pi peers here if SP-263 already did (coordinate; may land either order).

## Dependencies

- **None**

## Context to Read First

- Issue #154
- package.json engines
- .github/workflows/ci.yml
- README prerequisites

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/ci.yml`, `README.md` |
| May change | `.github/workflows/release.yml`, `.github/workflows/calibration-verify.yml`, `.github/workflows/eval-harness-smoke.yml` |
| Must NOT change | `package.json version field`, `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `.github/workflows/ci.yml` |
| fileScopeMustNotChange | `src/domain` |
| completionCriteria | CI Node pinned ≥22.19.0; README engines note; Closes #154 |

## Steps

### Step 0: Preflight

- [ ] Inventory workflows using node-version 22
- [ ] Confirm engines.node already >=22.19.0

### Step 1: Pin CI + docs

- [ ] Update workflows to 22.19.0 (or documented floor)
- [ ] README prerequisites / engine-strict note

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] STATUS lists updated workflow paths

## Completion Criteria

- [ ] CI Node pinned ≥22.19.0; README engines note; Closes #154

## Do NOT

- Downgrade engines below 22.19.0
- Bump package version
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `chore(SP-264): pin CI Node to engines floor (#154)`
