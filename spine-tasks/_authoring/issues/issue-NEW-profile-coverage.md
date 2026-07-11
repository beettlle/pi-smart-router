# NEW ISSUE — Capability profile coverage follow-on (#75 closed)

**GitHub:** [#108](https://github.com/beettlle/pi-smart-router/issues/108) (created)

**Suggested title:** Capability profile coverage: dogfood fleet `benchmark` vs `pattern_default`

**Suggested labels:** enhancement, routing, documentation

**Action:** Issue created. Keep [#75](https://github.com/beettlle/pi-smart-router/issues/75) **closed**. Comment on #75 linking #108 (do not reopen #75).

---

## Problem

HyDRA shortfall matching uses capability priors from `mapPiModelToProfile`. Implementation from #75 landed (`config/benchmark-profiles.json`, fleet aliases, `capability_source`), but models without a grounded row/alias still fall through to **pattern defaults**. Dogfood fleets need a measurable coverage story so quality-first routing is not silently guessing on common Cursor/pi model IDs.

## What already landed (do not re-implement)

Tracked and closed under #75:

- Benchmark ingest CLI (`npm run routing:ingest-benchmarks`)
- AST / fixture verification paths
- `mapPiModelToProfile` with `capability_source` (`benchmark` vs `pattern_default`)
- Fleet aliases (e.g. `cursor/auto`, `composer-latest`) in checked-in profiles

## Acceptance criteria

- [ ] Document which scoped dogfood fleet models resolve to `benchmark` vs `pattern_default` (table in README or `docs/`).
- [ ] Add or document a coverage metric (share of fleet IDs and/or live selections with `capability_source=benchmark`).
- [ ] Close intentional gaps in writing (which models stay `pattern_default` and why) **or** add aliases/rows so the primary dogfood fleet is fully grounded.
- [ ] Roadmap §2 status for capability profiles updated to Landed / Partial-remaining (via roadmap-sync issue) and points here instead of implying #75 is still open work.
- [ ] Comment on closed #75 linking this issue as the coverage follow-on.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Spot-check real fleet routing in live sessions | Human QA (`docs/qa/shadow-dogfood-protocol.md`) |
| Coverage report / alias gap list from config + mapper | Autonomous |
| New ingest rows / aliases from leaderboards | Autonomous (existing ingest scripts) |

## Commands / files

- `config/benchmark-profiles.json`
- `src/config/pi-model-mapper.ts`
- `npm run routing:ingest-benchmarks`
- `npm run routing:verify-benchmark-profiles`
- `docs/qa/shadow-dogfood-protocol.md`

## Out of scope

- Reopening or re-implementing #75 core ingest/mapper
- Encoder / ModernBERT enablement (#96)
- Changing shortfall τ without eval evidence
- Full rewrite of capability dimensions

## Links

- Parent (closed): https://github.com/beettlle/pi-smart-router/issues/75
- QA protocol: `docs/qa/shadow-dogfood-protocol.md`
- Roadmap sync draft: `spine-tasks/_authoring/issues/issue-NEW-roadmap-sync.md`
- Supersedes remaining AC in: `spine-tasks/_authoring/issues/issue-75-update.md`
