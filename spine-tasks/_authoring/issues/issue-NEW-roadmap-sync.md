# NEW ISSUE — Sync routing-roadmap.md status to landed code

**Suggested title:** Docs: refresh docs/routing-roadmap.md status column (landed vs Gap)

**Suggested labels:** documentation

**Action:** Create a new GitHub issue. Docs-only; autonomous.

---

## Problem

`docs/routing-roadmap.md` still marks several items as Gap/Partial and uses an “as of 2026-07-08” framing even though v0.9.3 code and closed spine tasks landed planning delegate, SAAR knobs, cache breakeven, virtual cost v2, profile ingest, encoder flags, TwinRouterBench soft-feed, and community bench tracks. Stale status causes agents to re-open completed work.

## Acceptance criteria

- [ ] Update §2 status cells for landed work (#71–#84 era and follow-ons) to Landed or Partial-remaining with one-line evidence (code path or closed issue).
- [ ] Reflect #102 / #103 / #105 (and related) as closed/landed where true.
- [ ] Add explicit pointer to #95 soft-feed + `docs/qa/shadow-dogfood-protocol.md` in Phase 5 / shadow deploy section.
- [ ] Cite #96 as enablement tracker for Granite/ModernBERT (not “build from scratch”).
- [ ] Fix header / “as of” date drift to match the edit date.
- [ ] Do **not** change priority ordering or invent new backlog rows beyond status truth and the #95/#96 pointers above.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Entire issue | Autonomous (docs-only PR) |

## Commands / files

- `docs/routing-roadmap.md`
- Cross-check: README, `spine-tasks/_authoring/backlog-snapshot-*.md`, closed issue list

## Out of scope

- Implementing routing features
- Changing release gates
- Rewriting deep-research / PRD

## Links

- QA protocol: `docs/qa/shadow-dogfood-protocol.md`
- Related updates: #95, #75, #96 drafts in this folder
