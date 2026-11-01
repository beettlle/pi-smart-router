# SP-305: Jev-compatible HTTP adapter + fail-closed factory — Status

**Current Step:** Complete (all steps done)
**Status:** Complete
**Last Updated:** 2026-11-01 (resumed: stet contract triage round 2)
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
**Status:** Complete

- [x] Fixture success/error matrix
- [x] Timeout, abort, unknown choice
- [x] Remote key gating; loopback body/headers
- [x] No state text in errors
- [x] Run Contract testCommand

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
- **Stet contract triage:** finding 844efc1 (stale `noul` JSDoc after the boolean→number
  fix) fixed by rewriting the `TypedJudgmentNoulQuestion` doc; finding 606c860 dismissed
  as false_positive — `redact()` only touches error/log messages; the request body
  intentionally carries state and question prompts as judge inputs, and the privacy
  requirement is about errors/logs, which tests assert.
- **Stet contract triage (resume round 2, 2026-11-01):** the scoped-baseline mechanism
  (`spine-stet-contract-run.sh default SP-305`) could not exclude SP-311's later commits on this
  shared lane, so the re-review produced 13 findings spanning both tasks. Triage:
  - `970fb6d` (CWD-relative fixture path in `tests/unit/typed-judgment-adapter.test.ts:30`) —
    fixed: `FIXTURES_DIR` now resolves via `fileURLToPath(new URL('../fixtures/typed-judgment', import.meta.url))`;
    suite verified green when invoked from a CWD outside the project root. Dismissed `already_correct`.
  - `606c860` — re-dismissed `false_positive` (same reasoning as round 1, recorded above).
  - 11 findings on SP-311-owned files (`scripts/ingest-benchmark-profiles.ts`,
    `tests/unit/ingest-benchmark-profiles.test.ts`, `tests/unit/pi-model-mapper.test.ts`,
    `tests/integration/pi-extension.test.ts`) — dismissed `out_of_scope`; they belong to SP-311's
    own contract review.
  Contract re-run: 0 active findings, exit 0.
