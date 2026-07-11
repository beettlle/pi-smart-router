# Update comment / body for GitHub #96

**Title (keep or refine):** Encoder / ModernBERT K=4 enablement decision (holdout ECE)

**Action:** Edit existing issue #96 (keep as product decision tracker). Implementation for Granite path and K=4 modules already exists behind feature flags — this issue is **enablement**, not greenfield build.

---

## Problem

Defaults remain `encoder: minilm` and `hydra_heads: learned_projection`. MiniLM’s 512-token limit truncates long agent prefixes. Granite and ModernBERT K=4 code paths exist but must not be promoted on fixture quality-retention alone.

## What already landed (do not re-implement)

- Schema flags: `encoder` minilm|granite; `hydra_heads` learned_projection|modernbert_k4
- Embedding provider Granite ONNX path
- ModernBERT K=4 matcher wiring (feature-flagged)
- `npm run benchmark:encoder`
- Pack holdout / calibration dry-run tooling (`routing:calibration-dry-run`, label packs)

## Acceptance criteria

- [ ] Run pack holdout ECE (SWE-Gym + FC-RewardBench packs; weak TwinRouterBench labels excluded from holdout ECE per existing rules).
- [ ] Run `npm run benchmark:encoder` and record p50/p95 vs latency budget (~80–120ms HyDRA path).
- [ ] Write a decision artifact (go/no-go) covering:
  - promote Granite as default encoder? yes/no + evidence
  - enable `modernbert_k4` by default? yes/no + evidence
- [ ] Decision artifact linked from this issue (path under `spine-tasks/_authoring/` or `docs/`).
- [ ] If promoting: PR flips defaults only after decision artifact + operator approve.
- [ ] Explicit: fixture-only QR is **insufficient** to flip defaults.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Operator approve of default flip | Human |
| Measurement run + decision writeup | Autonomous (see encoder-holdout-decision issue) |

## Commands / files

- `npm run benchmark:encoder`
- `npm run routing:calibration-dry-run`
- `src/config/defaults.ts`
- `src/domain/types/schemas.ts`
- `src/domain/matching/embedding-provider.ts`
- `src/domain/matching/modernbert-heads.ts`

## Out of scope

- Building encoder modules from scratch (already landed under #80/#81)
- Changing release-gate absolute thresholds
- Shadow dogfood protocol (#95)

## Links

- Autonomous measurement issue draft: `spine-tasks/_authoring/issues/issue-NEW-encoder-holdout-decision.md`
- README enablement note (pack holdout ECE, not fixture QR)
