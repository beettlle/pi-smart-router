# Task: SP-253 — Operator docs for runtime-integrity theme

**Created:** 2026-09-02
**Size:** S

## Review Level: 0

**Assessment:** Docs-only theme packet: long-session eviction, export-hash migration, degraded-mode reason codes.
**Score:** 0/8 — Blast radius: 0 (README only), Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#145, #146, #148 (docs only — issues closed by SP-248/250/252)
- Bucket: documentation
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Mission

Theme docs for **v0.21.0 runtime integrity & operator trust** after code packets land:

1. README long-running pi session note: `session_end` evicts in-memory routing state (#145 / SP-247–248).
2. Export-hash migration note: HMAC-pepper replaces unsalted SHA-256; operators comparing old vs new contrib exports must re-baseline (#146 / SP-249–250). Mention schema/version bump if SP-250 recorded one.
3. Degraded-mode reason-code table: `hydra_weights_missing`, `k4_heads_placeholder`, and `fail_closed_on_missing_weights` operator knob (#148 / SP-251–252).
4. Match shipped behavior — read landed code/STATUS discoveries; do not invent APIs.

## Dependencies

- **Task:** SP-248
- **Task:** SP-250
- **Task:** SP-252

## Context to Read First

- Manifest theme sentence in `spine-tasks/_authoring/release-v0.21.0/manifest.md`
- SP-248 / SP-250 / SP-252 STATUS discoveries (version bumps, knobs, hook names)
- `README.md` existing operator / telemetry / degraded-route sections

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | none |
| Must NOT change | `src/**`, `.pi/extensions/**`, `package.json` (version) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/**`, `.pi/extensions/**`, `package.json` |
| completionCriteria | README documents long-session eviction, hash migration, and missing-weights reason codes / fail_closed knob matching shipped code |

## Steps

### Step 0: Preflight

- [ ] Read SP-248/250/252 STATUS for final names, version bump, config keys

### Step 1: Author theme docs in README

- [ ] Long-session eviction note
- [ ] Export-hash migration note
- [ ] Degraded-mode reason-code + fail_closed table/section

### Step 2: Testing & Verification

- [ ] Confirm README paths match shipped APIs (no invented knobs)
- [ ] Contract `testCommand` (`true`) — docs-only
- [ ] Full suite optional: `npm test` if local env allows; do not change product code to force green

## Completion Criteria

- [ ] Theme docs complete and accurate to landed SP-248/250/252

## Do NOT

- Change application code under `src/**` or `.pi/extensions/**`
- Bump `package.json` version
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

## Git Commit Convention

- `docs(SP-253): runtime integrity operator notes (v0.21.0)`

## Amendments

- None
