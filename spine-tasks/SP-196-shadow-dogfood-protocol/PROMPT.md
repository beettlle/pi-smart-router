# Task: SP-196 — Shadow Dogfood Protocol + QA Script

**Created:** 2026-07-11
**Size:** S

## Review Level: 0

**Assessment:** Docs + bash companion for #95 autonomous AC; human sessions remain on #95.
**Score:** 1/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#95
- Bucket: documentation
- Partial: #95
- Release: v0.10.0

## Mission

Partial #95 — Land the operator-facing **shadow dogfood protocol** at `docs/qa/shadow-dogfood-protocol.md` and offline companion `npm run qa:shadow-dogfood` (`scripts/qa/shadow-dogfood-session.sh`) that archives hard fixture smoke + TwinRouterBench soft corpus report under `.pi-smart-router/qa-runs/`. Link from README TwinRouterBench / #95 section. Do **not** claim full #95 close — live dogfood window, exports, and sign-off remain human QA. Do **not** change `config/release-gates.json` absolute thresholds or invent Track B labels.

## Dependencies

- **None**

## Context to Read First

- `spine-tasks/_authoring/issues/issue-95-update.md`
- `docs/qa/shadow-dogfood-protocol.md` (may already exist on main from queue commit)
- `scripts/qa/shadow-dogfood-session.sh`
- `README.md` — TwinRouterBench / #95 section
- GitHub #95

## Environment

- **Workspace:** `docs/qa/`, `scripts/qa/`, `README.md`, `package.json`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `docs/qa/shadow-dogfood-protocol.md`, `scripts/qa/shadow-dogfood-session.sh`, `package.json`, `README.md` |
| May change | `.gitignore` (qa-runs ignore if needed) |
| Must NOT change | `config/release-gates.json`, `src/**`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `docs/qa/shadow-dogfood-protocol.md`, `scripts/qa/shadow-dogfood-session.sh` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/**` |
| completionCriteria | Protocol + qa script + README link + package.json script present; absolute gates untouched; #95 remains open for human QA. |

## Steps

### Step 1: Protocol + companion script

- [ ] Ensure `docs/qa/shadow-dogfood-protocol.md` covers setup, session matrix, export/privacy, hard vs soft gates, sign-off form, and non-goals (no threshold edits, no invented Track B labels)
- [ ] Ensure `scripts/qa/shadow-dogfood-session.sh` archives hard + soft reports under `.pi-smart-router/qa-runs/`
- [ ] Add `qa:shadow-dogfood` to `package.json` if missing
- [ ] README TwinRouterBench / #95 section links protocol + script

### Step 2: Testing & Verification

- [ ] Confirm script is executable / documented (`bash scripts/qa/shadow-dogfood-session.sh` or npm script)
- [ ] Run `npm run typecheck && npm test` (docs-only — full suite sanity)
- [ ] Comment on #95 summarizing autonomous land vs remaining human AC

## Documentation Requirements

**Must Update:**
- `docs/qa/shadow-dogfood-protocol.md` *(also in File Scope)*
- `README.md` — #95 / TwinRouterBench cross-link *(also in File Scope)*

**Check If Affected:**
- `docs/routing-roadmap.md` — Phase 5 pointer (owned by SP-197)

## Completion Criteria

- [ ] Protocol + companion script landed
- [ ] README linked
- [ ] Absolute gate thresholds unchanged
- [ ] #95 Partial (human sessions / sign-off remain)

## Git Commit Convention

- `docs(SP-196): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Change `config/release-gates.json` absolute thresholds
- Close #95 fully without human dogfood sign-off
- Implement Track B adapter (#111)
- Flip encoder defaults (#96 / #113)

## Amendments

None.
