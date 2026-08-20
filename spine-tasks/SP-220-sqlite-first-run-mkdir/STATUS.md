# SP-220: SQLite first-run parent mkdir — Status

**Current Step:** Step 1: Ensure parent dir before open
**Status:** In Progress
**Last Updated:** 2026-08-20
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 1: Ensure parent dir before open

**Status:** In Progress

- [x] Ensure parent of `dbPath` exists via recursive `mkdir` (skip `:memory:`)
- [x] Missing-parent / ENOENT not logged as corrupt-DB recovery
- [x] Preserve corrupt rename+recreate and unwritable MemoryStore fallback

**Plan-review checkpoint** — First-run vs corrupt path branched.

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Unit test: missing parent → degraded=false, file created, no corrupt-DB warning
- [ ] Existing fallback cases green
- [ ] Contract `testCommand`
- [ ] `npm run verify:ci` if time allows
- [ ] Coverage ≥77% when application code changed

---

## Completion Criteria

- [ ] Missing parent → mkdir + non-degraded SqliteStore
- [ ] No corrupt-DB theater on first-run ENOENT
- [ ] Corrupt + unwritable regressions green
- [ ] Missing-parent unit test present
- [ ] #130 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| — | — | — | — |
