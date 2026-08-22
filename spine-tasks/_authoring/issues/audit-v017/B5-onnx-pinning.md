## Summary

Pin ONNX embedding artifacts by digest, implement real embedder `dispose()`, and document supply-chain posture for the transformers/onnxruntime/adm-zip chain.

## Priority

P1

## Pipeline stages

`src/domain/matching/embedding-provider.ts`, `hydra-matcher.ts`, CI cache

## Problem / motivation

First HyDRA call downloads unpinned ONNX weights from HuggingFace (`Xenova/all-MiniLM-L6-v2`, granite community models). `dispose()` is no-op — native sessions live forever. `npm audit`: 12 vulns (10 high) via transformers→onnxruntime→adm-zip with no upstream fix.

## Proposed solution

- [ ] Pin model artifacts by SHA-256 in config; verify on load; fail closed in CI if cache missing.
- [ ] Implement real `dispose()` releasing ONNX session handles.
- [ ] Document operator offline cache setup + CI pre-warm step.
- [ ] Add `docs/` or README supply-chain section: accepted risk, monitoring, no anonymous fetch in production path when pin configured.
- [ ] Track npm audit exceptions with documented rationale (not silent dismiss).

## Evidence

- `src/domain/matching/embedding-provider.ts` ~14–22, ~59–68, ~84–86
- Grok/Sonnet audit P1 deps

## Dependencies

| Issue | Role |
|-------|------|
| #96 | Enablement separate from artifact pinning |

## Out of scope

- Removing HyDRA/ONNX entirely
- #96 default flip

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/embedding-provider.test.ts tests/unit/hydra-matcher.test.ts
npm audit  # document baseline; no new unmitigated highs without note
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Pinning + dispose + docs | Autonomous |
