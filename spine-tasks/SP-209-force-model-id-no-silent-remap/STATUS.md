# SP-209: Honor force_model_id / Prefer (No Silent Remap) — Status

**Current Step:** Step 1
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-20
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Diagnose + fix force/prefer path

**Status:** 🟡 In Progress (pending plan review)

- [x] Reproduce silent cross-provider remap
- [x] Fail-closed force/prefer fix
- [x] Explain / log reason surfaced
- [x] Fixtures: Gemini, codex-style, prefer Copilot

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
| 2026-07-20 | Two silent-remap roots found. (1) `turnEnvelope` short-circuited before `session_pin` on a first turn (no pin), dropping any `force_model_id`. (2) `SessionPinner` only evaluated force when a pin existed, and an unavailable force returned `break` (re-route) — losing the reason and silently remapping providers. | Fixed both: turnEnvelope defers to session_pin when force set; pinner resolves force with or without a pin and returns `force_rejected` carrying an explicit reason code. |
| 2026-07-20 | "NL prefer Copilot" (natural-language preference) has no existing wiring in src/ or .pi/extensions/ — only `force_model_id` one-shot via `model_select` hook. PROMPT scopes it as "where supported", so out of scope here; deterministic force path (the actual Copilot selection mechanism) is fully covered. | Documented; no code path to wire. |

## Notes

Depends on SP-208. Wave 2 after Wave 1 (SP-208 + SP-210).
