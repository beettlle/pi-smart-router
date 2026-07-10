# SP-174: Fleet Capability Profiles — Status

**Current Step:** 1
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Alias map and profile coverage

**Status:** 🔄 In Progress

- [x] Add alias map and/or expand benchmark-profiles for common scoped-fleet IDs
- [x] Keep ingest/verify path coherent
- [x] Prefer alias → existing model_id over inventing scores

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
| 2026-07-10 | 1 | plan | skipped (engine-owned; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Checked-in artifact has 5 model_ids only; live fleet IDs miss rows | Alias map in artifact + mapper |
| 2026-07-10 | ModelProfile / telemetry / explain outside File Scope | `capability_source` on MappedModelProfile + getCapabilitySource() |
| 2026-07-10 | gemini-2.5-pro has no fixture row — left pattern_default (no invented scores) | Document; add fixtures later |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | start | Resume from Step 1; plan review skipped by engine |
| 2026-07-10 | step1 | Aliases in artifact; ingest preserves; mapper resolves |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
