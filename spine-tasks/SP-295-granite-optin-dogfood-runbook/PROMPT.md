# Task: SP-295 — Granite opt-in dogfood runbook

**Created:** 2026-09-12
**Size:** S

## Review Level: 1

**Assessment:** Operator enablement runbook for Granite dogfood (#167); no default flip.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#167
- Release: v1.2.0
- Bucket: feature / docs
- Closes: #167 if AC met; else Partial (human dogfood remaining)

## Mission

Document operator opt-in Granite enablement: model fetch (`GRANITE_ONNX_MODEL` / HF ONNX id), config switch (`hydra.encoder: granite`), cache path, `npm run benchmark:encoder` measurement expectations, post-switch follow-ups feeding #96. Do **not** flip shipped defaults. Do **not** reimplement embedder (#80 landed).

## Dependencies

- SP-289

## Context to Read First

- Issue beettlle/pi-smart-router#167
- README encoder table
- `config/operator-config.json.example`
- `src/domain/matching/embedding-provider.ts` (`GRANITE_ONNX_MODEL`)
- `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` and/or `docs/migration-v1.md` (runbook sections) |
| May change | `config/operator-config.json.example` comments only, `spine-tasks/_authoring/release-v1.2.0/` notes |
| Must NOT change | `src/config/defaults.ts`, shipped `encoder: minilm` default |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/config/defaults.ts` |
| completionCriteria | Runbook covers fetch/switch/measure/follow-ups; STATUS records Close vs Partial for #167 |

## Steps

### Step 0: Preflight

- [ ] Confirm Granite code path already shipped (#80)
- [ ] Note local cache: Granite ONNX may be absent (MiniLM only)

### Step 1: Runbook

- [ ] Document fetch, switch, verify, benchmark archive path
- [ ] List post-switch follow-ups (latency, centroids, ECE, feed #96)
- [ ] Cross-link #96 — no default flip

### Step 2: Testing & Verification

- [ ] Run `npm run typecheck`
- [ ] STATUS: Close #167 only if autonomous AC fully met; else Partial + remaining human AC

## Do NOT

- Flip `encoder` default to granite
- Reimplement ONNX wiring
- Enable `modernbert_k4`

## Completion Criteria

- [ ] Operator runbook landed; Close vs Partial for #167 honest in STATUS
