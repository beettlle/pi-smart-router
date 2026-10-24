# Task: SP-309 — Operator docs: typed judgment setup, privacy, stage table

**Created:** 2026-10-24
**Size:** S

## Review Level: 1

**Assessment:** Docs-only — document the opt-in `typed_judgment` stage, OpenJev setup, config keys, privacy, and latency; sync stage lists.
**Score:** 1/8 — Blast radius: 0, Pattern novelty: 0, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#183
- Release: v1.3.0
- Bucket: documentation
- Partial: #183 (Sprint 1 operator docs; #184 README privacy note, #187 stage table)

## Mission

- `README.md`:
  - "How it works" stage table/list: add `typed_judgment` after `turn_envelope` (non-deciding, user-prompt turns only, default off).
  - New short section "Typed judgment (opt-in)": what it asks (six questions), that it records answers but does not change routing in v1.3.0, how to run local OpenJev (`http://127.0.0.1:8080/v1/systemone`, `openjev-latest`), config keys and env overrides from SP-304, latency expectations (~385–990 ms per user turn on Apple silicon; `tool_result` turns pay nothing), and fail-open behavior.
  - **Privacy note (#184):** with a hosted endpoint (TypeSafe Jev or Codiv) turn text leaves the machine; requires `allow_remote: true` and an API key in the env var named by `api_key_env`. Local OpenJev keeps text local. Keys are never read from config files.
  - Attribution: question rubrics adapted from pi-jev-model-router (MIT).
- `docs/migration-v1.md`: update the `PIPELINE_STAGE_ORDER` list to include `typed_judgment`.
- `docs/routing-roadmap.md`: add or update a row for typed judgment (#183) with status "Sprint 1 landed (opt-in, non-deciding)".

Use exact config key names and reason codes from the merged SP-304 / SP-307 code — read the source, do not copy from this packet if they differ.

## Dependencies

- SP-305 (adapter + factory reasons)
- SP-307 (stage name, skip reason codes)

## Context to Read First

- `README.md` (§ How it works, configuration sections)
- `src/domain/types/schemas.ts` (`TypedJudgmentConfigSchema`), `src/config/defaults.ts` (env names)
- `src/domain/pipeline/typed-judgment-stage.ts` (reason codes)
- `src/infrastructure/judgment/jev-typed-judgment-adapter.ts` (factory reasons)
- `docs/migration-v1.md`, `docs/routing-roadmap.md`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md`, `docs/migration-v1.md`, `docs/routing-roadmap.md` |
| May change | none |
| Must NOT change | `src/**`, `.pi/**`, `tests/**`, `package.json`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run lint:md --if-present && node -e "const r=require('fs').readFileSync('README.md','utf8');for(const s of ['typed_judgment','allow_remote','api_key_env','OpenJev']){if(!r.includes(s)){console.error('README missing '+s);process.exit(1)}}"` |
| fileScopeMustChange | `README.md`, `docs/migration-v1.md` |
| fileScopeMustNotChange | `src/`, `.pi/`, `tests/`, `package.json`, `.review/` |
| completionCriteria | README documents stage, setup, config, privacy, latency, attribution; stage lists synced in migration doc; roadmap row updated |

## Steps

### Step 0: Preflight

- [ ] Read merged config keys, env names and reason codes from source

### Step 1: README

- [ ] Stage table + "Typed judgment (opt-in)" section with privacy note and attribution

### Step 2: Docs sync

- [ ] `docs/migration-v1.md` stage order; `docs/routing-roadmap.md` row

### Step 3: Testing & Verification

- [ ] Names in docs match source exactly
- [ ] Run Contract `testCommand`

## Do NOT

- Claim typed judgment changes routing decisions in v1.3.0
- Document consumers from #188–#191 as shipped

## Completion Criteria

- [ ] Operator docs for the shipped capability present
- [ ] Contract check green
