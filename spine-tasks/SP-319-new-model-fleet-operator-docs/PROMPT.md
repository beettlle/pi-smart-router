# Task: SP-319 — operator docs for Kimi K3.1 + Gemini 4 carbon/hydrogen fleet

**Created:** 2026-11-15
**Size:** S

## Review Level: 0

**Assessment:** Docs-only — document newly covered Kimi K3 / K3.1 and Gemini 4 carbon/hydrogen fleet mapping for operators.
**Score:** 1/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- Release: v1.4.0
- Bucket: documentation

## Mission

Operator-facing docs for the v1.4.0 new-model theme after SP-314 / SP-316 / SP-318 land:

1. `README.md` — short note that Kimi K3 / K3.1 Pro map to frontier (pattern + optional benchmark grounding) and that Gemini 4 carbon/hydrogen are covered like argon (aliases / ungrounded provenance). Link to capability coverage doc if relevant.
2. `docs/capability-profile-coverage.md` — add rows or a short subsection for the new fixture/fleet ids actually shipped (only ids that exist in mapper/artifact after prior tasks).
3. `docs/routing-roadmap.md` — mark #195/#196/#197/#199/#200 as landed for v1.4.0 (or add a release note row).

Read merged source after deps land — do not invent ids or claim grounding that STATUS for SP-316 marked ungrounded.

## Dependencies

- SP-314
- SP-316
- SP-318

## Context to Read First

- `README.md`
- `docs/capability-profile-coverage.md`, `docs/routing-roadmap.md`
- Merged `src/config/pi-model-mapper.ts` and `config/benchmark-profiles.json` after deps

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md`, `docs/capability-profile-coverage.md`, `docs/routing-roadmap.md` |
| May change | none |
| Must NOT change | `src/**`, `.pi/**`, `tests/**`, `package.json`, `config/benchmark-profiles.json`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `node -e "const fs=require('fs'); for (const [p,ss] of [['README.md',['k3','carbon','hydrogen']],['docs/capability-profile-coverage.md',['k3','carbon']],['docs/routing-roadmap.md',['1.4.0','#195']]]) { const t=fs.readFileSync(p,'utf8').toLowerCase(); for (const s of ss){ if(!t.includes(s.toLowerCase())){ console.error(p+' missing '+s); process.exit(1);} } } console.log('docs ok');"` |
| fileScopeMustChange | `README.md`, `docs/capability-profile-coverage.md`, `docs/routing-roadmap.md` |
| fileScopeMustNotChange | `src/`, `.pi/`, `tests/`, `package.json`, `config/benchmark-profiles.json`, `.review/` |
| completionCriteria | README + coverage + roadmap mention new fleet coverage accurately |

## Steps

### Step 0: Preflight

- [ ] Read merged mapper rules and benchmark aliases/ungrounded lists from deps

### Step 1: Docs

- [ ] Update README, capability-profile-coverage, routing-roadmap to match shipped behavior

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand`

## Do NOT

- Claim benchmark grounding for ids still listed ungrounded
- Edit source or config artifacts

## Completion Criteria

- [ ] Operator docs reflect shipped Kimi + Gemini carbon/hydrogen coverage
- [ ] Contract green
