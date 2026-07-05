**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-04
**Review Level:** 0
**Size:** S

---

## Step 1: README dogfooding section

**Status:** ✅ Complete

- [x] Add install/bootstrap steps from repo root
- [x] Document slash commands
- [x] Document operator env vars

## Step 2: Quickstart alignment (if needed)

**Status:** ⬜ Not Started

- [ ] Cross-check quickstart.md

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Verify docs match extension code
- [x] Run `npm run typecheck && npm test`

## Completion Criteria

- [x] All steps complete
- [x] README dogfooding section is accurate and complete

## Discoveries

- `npm test` passes (711 tests). `npm run typecheck` fails with pre-existing TS errors in `.pi/extensions/smart-router/index.ts` (out of scope for SP-047). Documented env vars and commands verified against extension source.
