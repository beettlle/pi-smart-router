## Summary

Close or reset stale spine `STATUS.md` headers and add missing `.DONE` marker files for completed tasks (SP-221, SP-222, SP-125, etc.).

## Priority

P3

## Pipeline stages

`spine-tasks/**/STATUS.md`, `.DONE` markers

## Problem / motivation

SP-221/SP-222 marked `.DONE` in STATUS but lack `.DONE` files; SP-125, SP-134, SP-210, SP-129, SP-130 still “In Progress” despite landed code. Spine inventory unreliable for agents (Sonnet/Grok audit).

## Proposed solution

- [ ] Add `.DONE` files for SP-221 and SP-222 (landed 0.16.2).
- [ ] Update SP-125 STATUS to Done or document remaining AC explicitly.
- [ ] Reset SP-134, SP-210, SP-129, SP-130 headers to match STATUS step checkboxes.
- [ ] No routing code changes — process/docs only under `spine-tasks/`.

## Evidence

- Grok: comm reported SP-221/222 without `.DONE` file
- Sonnet: 5 STATUS files stale

## Dependencies

None.

## Out of scope

- Rewriting spine history
- GitHub issue creation for landed work

## Verification

```bash
# Manual: spine inventory script if exists
find spine-tasks -name STATUS.md -exec grep -l "In Progress" {} \;
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| STATUS + .DONE hygiene | Autonomous |
