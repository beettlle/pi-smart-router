**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-05
**Review Level:** 2
**Size:** M

---

## Step 1: Install pepper management

**Status:** ✅ Complete

- [x] Generate/load pepper from `.pi-smart-router/.dataset-key`
- [x] Ensure `.dataset-key` in `.gitignore`

## Step 2: Fingerprint computation

**Status:** ✅ Complete

- [x] Normalize prompt (whitespace collapse, trim)
- [x] HMAC-SHA256(install_pepper, normalized_prompt)
- [x] Gate on `SMART_ROUTER_DATASET_FINGERPRINT=1` (requires SMART_ROUTER_DATASET=1)

## Step 3: Schema and persistence

**Status:** ✅ Complete

- [x] Add `prompt_fingerprint` column to dataset table (SQLite migration v3)
- [x] Wire fingerprint into dataset recorder on routing path

## Step 4: Tests and README

**Status:** ✅ Complete

- [x] Test: fingerprint stored when enabled; pepper never in export
- [x] Test: disabled by default
- [x] README: opt-in env var + rainbow-table warning

## Step 5: Testing and verification

**Status:** ✅ Complete

- [x] Run `npm run typecheck && npm test`
- [x] Run `npm run build`
- [x] Run `npm run coverage:check` — script absent (pre-existing project gap)

## Completion Criteria

- [x] Fingerprint opt-in works; pepper never exported
- [x] README updated
- [x] Tests and build pass
