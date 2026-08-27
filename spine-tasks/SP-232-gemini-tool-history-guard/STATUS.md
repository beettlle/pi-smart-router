# SP-232: Expand Gemini tool-history guard + README — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-08-27
**Review Level:** 1
**Size:** M

---

## Step 1: Expand tool-history guard

**Status:** ✅ Complete (plan review engine-skipped per SP-195)

- [x] Exclude Gemini / prefer non-Google with reason_code
- [x] Empty-fleet actionable path

## Step 2: README + tests

**Status:** 🔄 In Progress

- [x] README repair/reroute primary
- [x] Guard unit tests

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand`
- [ ] `npm test` + coverage gate

---

## Completion Criteria

- [ ] #158 AC met (guard + docs)
- [ ] Issue closable

## Discoveries

- GitNexus MCP tool params are truncated to first char in this worker session (harness bug); used grep-based impact analysis instead — guard predicates only consumed by `route-and-delegate.ts` / `index.ts` re-export / guard tests (LOW risk).
- SP-231 sentinel repair covers unsigned cross-provider toolCalls (its extension test routes unsigned history to Gemini in a mixed fleet), so the guard must NOT exclude on unsigned-only history. SP-232 expansion targets repair-unsafe state: any-origin redacted thinking and foreign (non-Google) signatures that repair preserves but Google rejects.
