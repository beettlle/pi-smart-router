# SP-174: Fleet Capability Profiles — Status

**Current Step:** 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Alias map and profile coverage

**Status:** ⬜ Not Started

- [ ] Add alias map and/or expand benchmark-profiles for common scoped-fleet IDs
- [ ] Keep ingest/verify path coherent
- [ ] Prefer alias → existing model_id over inventing scores

## Step 2: Source signal + tests + docs

**Status:** ⬜ Not Started

- [ ] Surface capability source (benchmark vs pattern default)
- [ ] Unit/integration: at least one real scoped-fleet ID not pattern-default-only
- [ ] Document add-new-fleet-ID flow after ingest

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Run scoped vitest for mapper + ingest
- [ ] Run `routing:verify-benchmark-profiles` if needed
- [ ] Run full `npm test`
- [ ] Run coverage gate

---

## Completion Criteria

- [ ] Common dogfood scoped-fleet IDs resolve benchmark-backed rows (or aliases)
- [ ] Add-new-fleet-ID docs present
- [ ] Test proves at least one real scoped-fleet ID is not pattern-default-only
- [ ] Capability source visible to operators

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
