# SP-209: Honor force_model_id / Prefer (No Silent Remap) — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-07-19
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Diagnose + fix force/prefer path

**Status:** ⬜ Not Started

- [ ] Reproduce silent cross-provider remap
- [ ] Fail-closed force/prefer fix
- [ ] Explain / log reason surfaced
- [ ] Fixtures: Gemini, codex-style, prefer Copilot

## Step 2: Non-regression

**Status:** ⬜ Not Started

- [ ] Anthropic-only fleets still force correctly
- [ ] Missing/unhealthy force fails closed
- [ ] SP-210 pin-break scope untouched

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand` green
- [ ] Related unit tests if shared
- [ ] coverage:check
- [ ] #121 commented + closable

---

## Completion Criteria

- [ ] Healthy force selects target id
- [ ] Impossible force fails closed with reason
- [ ] Explain/log surfaces reason
- [ ] Fixtures green
- [ ] #121 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Notes

Depends on SP-208. Wave 2 after Wave 1 (SP-208 + SP-210).
