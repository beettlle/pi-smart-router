# Task: SP-266 — shadow dogfood protocol 95

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Harden shadow dogfood protocol and release-gate soft-feed wiring.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#95
- Bucket: feature
- Partial: #95 (human evidence pack SP-267)
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #95 — make the **operator-facing shadow dogfood protocol** and release-gate soft-feed path runnable without inventing quality claims:

1. Read `docs/qa/shadow-dogfood-protocol.md` and `config/release-gates.json`.
2. Harden soft-feed / dry-run wiring so operators can attach dogfood exports to gates.
3. Document exact commands (`npm run qa:shadow-dogfood` and related) and what constitutes a pass/fail for frugality relaxation.
4. Do **not** relax frugality defaults in this packet. Do **not** invent labels.

## Dependencies

- **None**

## Context to Read First

- Issue #95
- docs/qa/shadow-dogfood-protocol.md
- config/release-gates.json
- package.json qa:shadow-dogfood

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `docs/qa/shadow-dogfood-protocol.md` |
| May change | `config/release-gates.json`, `scripts/** related to qa:shadow-dogfood`, `README.md cross-links` |
| Must NOT change | `config/operator-config.json.example frugality defaults flip`, `config/p-success-weights.json (SP-271)` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `docs/qa/shadow-dogfood-protocol.md` |
| fileScopeMustNotChange | `config/p-success-weights.json` |
| completionCriteria | Protocol + soft-feed path ready for human dogfood; Partial #95 |

## Steps

### Step 0: Preflight

- [ ] Read existing protocol + release-gates
- [ ] Identify soft-feed gaps

### Step 1: Protocol + soft-feed

- [ ] Harden docs/commands
- [ ] Wire soft-feed if code gaps exist

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] STATUS lists operator command sequence

## Completion Criteria

- [ ] Protocol + soft-feed path ready for human dogfood; Partial #95

## Do NOT

- Relax frugality defaults
- Invent dogfood labels
- Ship routing-calibration.json (SP-271)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-266): harden shadow dogfood protocol (#95)`
