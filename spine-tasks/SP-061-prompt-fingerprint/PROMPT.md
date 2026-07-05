# Task: SP-061 — Prompt Fingerprint

**Created:** 2026-07-05
**Size:** M

## Review Level: 2

**Assessment:** Optional Tier 2 install-local prompt fingerprint for dedup without storing plaintext.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#10
- Bucket: feature

## Mission

Tier 2 optional enhancement: detect duplicate prompts within an install without storing plaintext.

Tasks:
- `prompt_fingerprint = HMAC-SHA256(install_pepper, normalized_prompt)`
- Pepper stored in `.pi-smart-router/.dataset-key` (gitignored), **never exported**
- Separate opt-in: `SMART_ROUTER_DATASET_FINGERPRINT=1`
- Document rainbow-table risk on short prompts in README

## Dependencies

- SP-060

## Context to Read First

- `src/infrastructure/telemetry/dataset-recorder.ts`
- `src/domain/types/entities.ts` — `RoutingDatasetRecord`
- `src/infrastructure/persistence/sqlite-store.ts`
- `.pi/extensions/smart-router/index.ts`
- `.gitignore` — ensure `.dataset-key` gitignored
- `README.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/telemetry/dataset-recorder.ts` |
| May change | `src/domain/types/entities.ts`, `src/infrastructure/persistence/sqlite-store.ts`, `.pi/extensions/smart-router/index.ts`, `.gitignore`, `README.md`, `tests/unit/dataset-recorder.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/telemetry/dataset-recorder.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | SMART_ROUTER_DATASET_FINGERPRINT=1 stores HMAC fingerprint; pepper in gitignored .dataset-key; pepper never exported; README documents opt-in and rainbow-table risk; tests pass. |

## Steps

### Step 1: Install pepper management

- [ ] Generate/load pepper from `.pi-smart-router/.dataset-key`
- [ ] Ensure `.dataset-key` in `.gitignore`

### Step 2: Fingerprint computation

- [ ] Normalize prompt (whitespace collapse, trim)
- [ ] HMAC-SHA256(install_pepper, normalized_prompt)
- [ ] Gate on `SMART_ROUTER_DATASET_FINGERPRINT=1` (requires SMART_ROUTER_DATASET=1)

### Step 3: Schema and persistence

- [ ] Add `prompt_fingerprint` column to dataset table (SQLite migration) or extend record type
- [ ] Wire fingerprint into dataset recorder on routing path

### Step 4: Tests and README

- [ ] Test: fingerprint stored when enabled; pepper never in export
- [ ] Test: disabled by default
- [ ] README: opt-in env var + rainbow-table warning

### Step 5: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run build`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Fingerprint opt-in works; pepper never exported
- [ ] README updated
- [ ] Tests and build pass

## Git Commit Convention

- `feat(SP-061): description`

## Do NOT

- Store prompt plaintext
- Export install pepper in JSONL export
- Implement outcome labels (SP-062)

---

## Amendments (Added During Execution)

- **2026-07-05:** SP-060 may preland export command in commands.ts. Fingerprint must not revert export wiring.
