# SP-305: Jev-compatible HTTP adapter + fail-closed factory — Status

**Current Step:** Step 3: Testing & Verification
**Status:** In Progress
**Last Updated:** 2026-11-01
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm SP-304 on main and AbortSignal.any on Node floor

---

### Step 1: Adapter
**Status:** Complete

- [x] Request building, response validation, error mapping

---

### Step 2: Retry, timeout, abort, factory
**Status:** Complete

- [x] Bounded retry, AbortSignal.any, fail-closed factory

---

### Step 3: Testing & Verification
**Status:** In Progress

- [ ] Fixture success/error matrix
- [ ] Timeout, abort, unknown choice
- [ ] Remote key gating; loopback body/headers
- [ ] No state text in errors
- [ ] Run Contract testCommand

---

## Discoveries

- **Wire `noul` is a probability, not a boolean.** OpenJev (`openjev/engine.py`) returns
  `{"type": "noul", "noul": P(yes)}` (float 0–1); the README/SDK confirm (`r.nouls["urgent"].noul # 1.00`).
  The SP-304 port declared `noul: boolean`, which would force the adapter to threshold at 0.5 and
  destroy the calibration the epic exists for — and SP-306's mapper explicitly wants probabilities
  (`deepReasoningP`, `destructiveP`). Fixed the port type to `number` (P(yes) ∈ [0,1]) under the
  PROMPT "type fixes only" may-change clause, with a one-line type-conformance update to
  `tests/unit/typed-judgment-config.test.ts` (`noul: true` → probability). No behavioral change to
  SP-304 code.
- **Wire answers carry a `type` discriminator and scores are 0-indexed expected levels.**
  The adapter re-keys score `legend`/`probabilities` from wire level indices onto the question's
  anchor score values (matching the SP-304 port test's expectations) and computes the domain
  `score` as Σ pᵢ·anchorᵢ.score.
- **Wire questions differ from domain questions:** the adapter translates
  `{id, kind, prompt, …}` → Jev `{type, instructions, criteria}` keyed by question id
  (choice criteria map each option to itself; score criteria are the anchor descriptions in
  ascending order; noul criteria are `{true, false}`).
