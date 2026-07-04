# Task: SP-042 — Settings Command

**Created:** 2026-07-03
**Size:** S

## Review Level: 1

**Assessment:** Slash command for status and scoped-only toggle.
**Score:** 2/8

## Mission

Register a `/smart-router` command via `pi.registerCommand()` that shows the last routing decision (model, stage, reason, latency) and toggles between "scoped models only" (default) and "all available models" mode. Use `pi.appendEntry()` for preference persistence.

## Dependencies

- SP-041

## Context to Read First

- Pi extension docs (commands): `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — search for `registerCommand`
- `.pi/extensions/smart-router/index.ts` — extension from SP-040/041

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `spine-tasks/SP-042-settings-command/STATUS.md` |
| fileScopeMustNotChange | `src/domain/**` |

## Steps

### Step 1: Command registration

- [ ] Register `/smart-router` via `pi.registerCommand()`
- [ ] Subcommands: `status` (default, shows last routing decision), `mode scoped|all` (toggle)
- [ ] Display: model selected, stage, reason code, routing latency, fleet size
- [ ] Use `pi.appendEntry()` to persist mode preference

### Step 2: Fleet rebuild on mode change

- [ ] When mode changes, rebuild fleet from `modelRegistry.getAvailable()` with appropriate filter
- [ ] "scoped" = user's scoped models only; "all" = everything authenticated

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-042): description`

## Do NOT

- Modify domain layer (`src/domain/**`)
- Write integration tests (SP-043)

---

## Amendments (Added During Execution)
