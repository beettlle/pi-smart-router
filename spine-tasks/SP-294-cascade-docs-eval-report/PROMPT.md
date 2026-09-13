# Task: SP-294 — cascade docs + eval report

**Created:** 2026-09-12
**Size:** S

## Review Level: 1

**Assessment:** Operator docs + cascade replay evidence for #173 close.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#173
- Release: v1.2.0
- Bucket: documentation
- Closes: #173 (with SP-291–SP-293)

## Mission

Update README encoder table + `docs/migration-v1.md` composition/config notes for opt-in cascade. Check in a cascade replay report under `docs/qa/` (evidence only — **not** a default flip). Confirm #173 acceptance criteria met across SP-291–293.

## Dependencies

- SP-291
- SP-292
- SP-293

## Context to Read First

- Issue beettlle/pi-smart-router#173 acceptance criteria
- README encoder section
- `docs/migration-v1.md`
- `npm run benchmark:encoder` / dogfood packs available locally

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md`, `docs/migration-v1.md`, `docs/qa/` (cascade replay report) |
| May change | `spine-tasks/_authoring/release-v1.2.0/` notes |
| Must NOT change | `src/config/defaults.ts` encoder default, cascade enabled default |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `README.md`, `docs/migration-v1.md`, `docs/qa/` |
| fileScopeMustNotChange | `src/config/defaults.ts` |
| completionCriteria | Docs + qa report present; #173 AC checklist in STATUS; no default flips |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-291–293 landed behaviors to document
- [ ] Locate encoder table + migration sections

### Step 1: Docs + report

- [ ] README + migration notes for cascade (default off)
- [ ] Write `docs/qa/` cascade replay report (evidence, not default flip)

### Step 2: Testing & Verification

- [ ] Run `npm run typecheck`
- [ ] STATUS lists #173 AC with SP-291–293 evidence pointers

## Do NOT

- Enable cascade or flip encoder defaults
- Claim #96 / ModernBERT progress

## Completion Criteria

- [ ] #173 closable on publish; docs + report checked in
