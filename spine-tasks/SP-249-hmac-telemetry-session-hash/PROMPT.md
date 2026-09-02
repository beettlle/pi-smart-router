# Task: SP-249 — HMAC-pepper hashSessionIdForTelemetryExport

**Created:** 2026-09-02
**Size:** S

## Review Level: 1

**Assessment:** Replace unsalted SHA-256 session hash in infra telemetry with HMAC + install pepper (dataset-recorder pattern).
**Score:** 4/8 — Blast radius: 1 (telemetry infra), Pattern novelty: 1, Security: 2 (hashing/privacy), Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#146
- Bucket: feature
- Partial: #146 (CLI dedupe + contracts is SP-250)
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Mission

Partial #146 — harden **community/session telemetry export hashing** in `src/infra/telemetry.ts`:

1. Replace unsalted `createHash('sha256')` in `hashSessionIdForTelemetryExport` with HMAC-SHA256 + install-local pepper.
2. Reuse `.dataset-key` / `loadOrCreateDatasetPepper` pattern from `dataset-recorder.ts` (shared util OK — prefer one pepper loader, do not invent a second pepper file without justification).
3. Pepper file must remain `0600`; never export pepper fields.
4. Unit tests: hash stable per install/cwd pepper; raw `session_id` never appears in export record builders covered here.
5. Do **not** rewrite CLI duplicate yet (SP-250). Do **not** write operator migration docs (SP-253).

## Dependencies

- **None**

## Context to Read First

- Issue #146 body — HMAC + pepper acceptance
- `Parent split: SP-249/250 — #146 telemetry hash`
- `src/infra/telemetry.ts` — current unsalted hash
- `src/infrastructure/telemetry/dataset-recorder.ts` — `loadOrCreateDatasetPepper` / `computePromptFingerprint`
- `tests/unit/telemetry-export.test.ts` (or adjacent)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infra/telemetry.ts` |
| May change | `src/infrastructure/telemetry/dataset-recorder.ts` (shared pepper helper extract), new small util under `src/infrastructure/telemetry/`, `tests/unit/telemetry-export.test.ts`, `tests/unit/**` (adjacent) |
| Must NOT change | `src/cli/smart-router-cli.ts` (SP-250), `README.md` (SP-253), `package.json` (version) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/telemetry-export.test.ts` |
| fileScopeMustChange | `src/infra/telemetry.ts` |
| fileScopeMustNotChange | `src/cli/smart-router-cli.ts`, `README.md`, `package.json` |
| completionCriteria | hashSessionIdForTelemetryExport uses HMAC+pepper; stable per install; unit tests cover; CLI still may duplicate until SP-250 |

## Steps

### Step 0: Preflight

- [ ] Read current hash + dataset pepper loader
- [ ] Decide shared util vs import existing loader

### Step 1: HMAC hash in infra telemetry

- [ ] Implement HMAC-pepper `hashSessionIdForTelemetryExport`
- [ ] Ensure pepper never appears in export payloads
- [ ] Keep export field name `session_id_hash` unless schema already versions another name

### Step 2: Testing & Verification

- [ ] Unit tests: stable hash; no raw session id in built export rows
- [ ] Contract `testCommand` green

## Completion Criteria

- [ ] Infra telemetry hash uses HMAC+pepper; Partial #146

## Do NOT

- Leave unsalted SHA-256 as the production path
- Edit CLI (SP-250) or README (SP-253)
- Log or export pepper / install_pepper fields
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-249): HMAC-pepper telemetry session hashes (#146)`

## Amendments

- None
