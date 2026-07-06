# SP-092 Status

**Current Step:** Step 1
**Status:** Ready
**Last Updated:** 2026-07-06
**Review Level:** 1
**Size:** M

---

## Step 1: Extend ModelProfile and schema

**Status:** Not Started

- [ ] Add `limits` block to entities, schemas, and models.yaml.example

## Step 2: LiteLLM ingest and merge

**Status:** Not Started

- [ ] Parse context limits in litellm-fetch
- [ ] Resolve and merge limits onto fleet ModelProfile

## Step 3: Testing and verification

**Status:** Not Started

- [ ] Unit tests for normalize + merge precedence
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] `npm run verify:ci` passes
