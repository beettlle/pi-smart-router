# SP-306: Readable judge state + six-question schema + answer mapper — Status

**Current Step:** Step 2: Questions, mapper, acknowledgement detector
**Status:** In Progress
**Last Updated:** 2026-11-01
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm SP-303 and SP-304 on main — `src/domain/pinning/tool-failure.ts` and `src/domain/ports/typed-judgment-port.ts` present on lane branch

---

### Step 1: State builder
**Status:** Complete

- [x] JSON state, token cap, no cost keys — `src/domain/judgment/judge-state.ts`; ~500 estimated-token cap via `estimatePromptTokens` (activity trimmed before user-message tail), `last_tool_failed` via shared SP-303 `isToolFailure`

---

### Step 2: Questions, mapper, acknowledgement detector
**Status:** In Progress

- [x] Six-question constants + attribution + version hash — `questions.ts`; ids `task_kind`, `capability_deserved`, `needs_deep_reasoning`, `code_gen`, `tool_use`, `destructive`; pi-jev-model-router (MIT, © 2026 Shah Rukh) attribution; `TYPED_JUDGMENT_QUESTION_SET_VERSION` (FNV-1a over canonical JSON)
- [x] Mapper + acknowledgement detector with depth guard — `answer-mapper.ts` (`mapTypedJudgment`, normalize by `levels - 1`, unknown choice/kind mismatch/range rejected as `invalid_response`, missing → null); `isAcknowledgement` in `judge-state.ts` with ≥100-message depth rule (#179)

---

### Step 3: Testing & Verification
**Status:** In Progress

- [x] Golden incident state snapshots — six fixtures under `tests/fixtures/typed-judgment/` (#97 cleanup, #179 deep continuation, #23 planning, trivial indent, thanks!, subtle debug); loop test asserts parsed state equals golden, cap holds, no cost keys
- [x] Token cap and no cost keys — unit tests: 5,000-char message + 2,000-char activity stays ≤500 est. tokens; recursive key scan against forbidden key set; activity lines ≤2, each truncated with ellipsis
- [x] Mapper normalization and rejection — `typed-judgment-questions.test.ts` (normalize by `levels − 1`; unknown choice, kind mismatch, out-of-range score/confidence → `invalid_response`; missing → null)
- [x] Deep-session "continue" not an acknowledgement — depth-guard test with a 1,201-message request
- [ ] Run Contract testCommand
