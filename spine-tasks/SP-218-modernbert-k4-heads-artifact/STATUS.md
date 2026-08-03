# SP-218: Train / Ship ModernBERT K=4 Heads Artifact — Status

**Current Step:** 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Train path + artifact or Partial

**Status:** ⬜ Not Started

- [ ] Inspect privacy-safe training sources
- [ ] Train script + ship `config/modernbert-k4-heads.json` **or** Partial writeup
- [ ] Provenance recorded
- [ ] package.json script alias when train path exists

**Plan-review checkpoint** — No invented weights; schema valid; defaults untouched.

## Step 2: Loader verification + tests

**Status:** ⬜ Not Started

- [ ] DEFAULT path load non-null (or Partial documents null)
- [ ] Unit tests extended
- [ ] defaults.ts unchanged

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand`
- [ ] `npm run verify:ci` if time allows
- [ ] coverage:check ≥77%
- [ ] #114 comment (do not close); #96 not closed

---

## Completion Criteria

- [ ] Heads loadable **or** Partial blocker documented
- [ ] Train path or honest rationale
- [ ] Tests green; defaults/gates untouched
- [ ] #114 open for SP-219; #96 open

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.16.0 ModernBERT K=4 measurement theme. Serial before SP-219.
