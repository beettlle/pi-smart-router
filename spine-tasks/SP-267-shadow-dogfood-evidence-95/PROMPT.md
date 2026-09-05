# Task: SP-267 — shadow dogfood evidence 95

**Created:** 2026-09-05
**Size:** M

## Review Level: 1

**Assessment:** Produce human dogfood evidence artifact for release gates.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 1 (privacy), Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#95
- Bucket: feature
- Closes: #95
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Closes #95 — collect **human QA dogfood** evidence and write a release gate decision artifact under `spine-tasks/_authoring/release-v1.0.0/`.

1. Follow SP-266 protocol; run live pi sessions / exports as operator (human-owned collection).
2. Aggregate enough signal for gate review (document sample counts; do not invent rows).
3. Write `spine-tasks/_authoring/release-v1.0.0/shadow-dogfood-evidence.md` with: commands run, sample floor status, gate recommendation (keep frugality / conditional / ready).
4. If sample floor unmet, document blocker honestly — do not close quality claims falsely.
5. Autonomous worker may scaffold the artifact template and command dry-runs; **live session collection is human**.

## Dependencies

- **SP-266**

## Context to Read First

- SP-266 STATUS
- docs/qa/shadow-dogfood-protocol.md
- Issue #95

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `spine-tasks/_authoring/release-v1.0.0/shadow-dogfood-evidence.md` |
| May change | `docs/qa/** notes`, `data/contrib/ only if operator exports land (privacy-safe)` |
| Must NOT change | `config/operator-config.json.example default flips`, `Invent labeled rows` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `spine-tasks/_authoring/release-v1.0.0/shadow-dogfood-evidence.md` |
| fileScopeMustNotChange | `config/p-success-weights.json` |
| completionCriteria | Evidence artifact committed with honest gate recommendation; Closes #95 or documents unmet floor |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-266 protocol commands
- [ ] Operator schedules dogfood sessions

### Step 1: Collect + write evidence

- [ ] Run protocol / attach exports
- [ ] Write shadow-dogfood-evidence.md with counts + recommendation

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] No synthetic invented labels

## Completion Criteria

- [ ] Evidence artifact committed with honest gate recommendation; Closes #95 or documents unmet floor

## Do NOT

- Invent labels
- Relax frugality without evidence
- Train calibration artifacts (SP-270)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `docs(SP-267): shadow dogfood evidence for v1.0 (#95)`
