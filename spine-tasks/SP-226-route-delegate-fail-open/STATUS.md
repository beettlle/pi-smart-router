# SP-226: route-and-delegate fail-open — Status

**Current Step:** Step 1
**Status:** In Progress
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Step 1: Replace throws with fail-open paths

**Status:** Not started

- [ ] Safe fallback on missing registry model
- [ ] Degraded response on stream exhaustion
- [ ] Reason codes in telemetry/explain

## Step 2: Testing and verification

**Status:** Not started

- [ ] Exhausted fleet test — no throw
- [ ] Contract `testCommand`
- [ ] `npm run verify:ci`

---

## Completion Criteria

- [ ] Fail-open on exhaustion paths
- [ ] #140 closable
