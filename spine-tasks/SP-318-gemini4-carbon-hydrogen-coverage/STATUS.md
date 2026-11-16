# SP-318: cover gemini-4-carbon and gemini-4-hydrogen — Status

**Current Step:** Complete
**Status:** Completed
**Last Updated:** 2026-11-16
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm existing Gemini 4+ rule; mirror argon pattern

---

### Step 1: Aliases / provenance / tests
**Status:** Complete

- [x] Aliases, ungrounded/grounded, unit tests
  - `DEFAULT_UNGROUNDED_FLEET_IDS` + artifact provenance list carbon/hydrogen (+ `google/…`)
  - Mapper tests + scoped-fleet table + ingest SCOPED_UNGROUNDED_IDS

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Run Contract testCommand
  - typecheck + vitest mapper/ingest + routing:verify-benchmark-profiles green (operator completion; no stet this packet)

### Discoveries
- Operator completed on main after earlier waves spent stet budget on SP-315/SP-316; scope was S and disjoint from remaining docs.
