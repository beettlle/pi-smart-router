# Task: SP-157 — Granite latency benchmark and operator docs

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** #80 part 2 — latency budget check (80–120ms) and benchmark vs MiniLM.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#80
- Release: v0.6.0
- Bucket: feature

## Mission

Add latency benchmark script comparing Granite vs MiniLM on held-out agent turn sample. Verify Granite meets 80–120ms budget. Document encoder swap in README operator section.

## Dependencies

- SP-156

## Context to Read First

- `src/domain/matching/embedding-provider.ts`
- `scripts/` benchmark patterns
- `README.md` operator section
- GitHub #80 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/benchmark-encoder-latency.ts` |
| May change | `tests/unit/benchmark-encoder-latency.test.ts`, `README.md`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/benchmark-encoder-latency.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Benchmark script output; latency budget assertion; README operator docs for encoder flag. |

## Steps

### Step 1: Benchmark script

- [ ] Create `scripts/benchmark-encoder-latency.ts` comparing MiniLM vs Granite
- [ ] Use held-out agent turn sample fixtures
- [ ] Report p50/p95 latency; assert Granite within 80–120ms budget

### Step 2: Docs and npm script

- [ ] Add `npm run benchmark:encoder` script
- [ ] Document encoder flag and benchmark in README operator section
- [ ] Unit test for script fixture loading (no ONNX required in CI)

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Latency benchmark script output
- [ ] Granite within 80–120ms budget on sample
- [ ] README operator section updated
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-157): description`

## Do NOT

- Wire K=4 heads (SP-158+)

---
