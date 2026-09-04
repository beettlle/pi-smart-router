# Task: SP-261 — Supply-chain / offline cache operator docs

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Document ONNX pin verification, offline cache warm, and accepted npm audit posture for the transformers chain.
**Score:** 2/8 — Blast radius: 0 (docs), Pattern novelty: 0, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#147
- Bucket: documentation
- Partial: #147 (closes with SP-260)
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Mission

Partial #147 docs — operator-facing supply-chain notes for pinned ONNX artifacts:

1. Document how to warm/offline the artifact cache (`hydra.artifact_cache_path`), how pin verification behaves, and that anonymous fetch must not silently bypass pins when configured.
2. Document accepted `npm audit` posture for transformers→onnxruntime→adm-zip (baseline + monitoring; no silent dismiss without rationale).
3. Prefer README section and/or `docs/` page; cross-link from operator config example comments if helpful.
4. Do **not** change embedder code except comment/docstring fixes. Do **not** own full theme narrative for facade/coverage (SP-262).

## Dependencies

- **SP-259**

## Context to Read First

- SP-259 STATUS — pin config location + verify behavior
- Issue #147 proposed docs bullets
- README embedding / HyDRA sections
- `config/operator-config.json.example`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `docs` supply-chain page, `config/operator-config.json.example` comments |
| Must NOT change | `src/domain/matching/embedding-provider.ts` logic (SP-259/260), `.pi/extensions/smart-router`, `vitest.config.ts`, `package.json` version field |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `package.json`, `src/domain/matching/embedding-provider.ts`, `.pi/extensions/smart-router` |
| completionCriteria | Operator docs cover pin verify, offline cache, audit posture; Partial #147 |

## Steps

### Step 0: Preflight

- [ ] Read SP-259 pin behavior + current README embedding section

### Step 1: Write supply-chain docs

- [ ] Add offline cache + pin verify guidance
- [ ] Document npm audit accepted risk / monitoring
- [ ] Optional operator-config comment cross-links

### Step 2: Testing & Verification

- [ ] Contract `testCommand` green
- [ ] Links/paths in docs resolve

## Completion Criteria

- [ ] Supply-chain docs landed; Partial #147

## Do NOT

- Change pin/dispose implementation (SP-259/260)
- Write full facade/coverage theme narrative (SP-262)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `docs(SP-261): ONNX supply-chain and offline cache (#147)`

## Amendments

- None
