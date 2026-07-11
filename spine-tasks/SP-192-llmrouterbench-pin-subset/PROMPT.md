# Task: SP-192 — LLMRouterBench Pin + Code/Tool Subset

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Pin LLMRouterBench and curate an offline code/tool subset converter into our frozen-catalog eval schema.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#103
- Bucket: feature
- Partial: #103 (pin + subset; regret report in SP-193)
- Release: v0.9.3

## Mission

Partial #103 — TwinRouterBench static track is small (~970 / CI ≤50). [LLMRouterBench](https://huggingface.co/datasets/NPULH/LLMRouterBench) (arXiv:2601.07206) provides large multi-model outcome matrices including LiveCodeBench, SWE-Bench, and tool-use slices. Pin a dataset version, map model IDs to the frozen pi catalog + checkpoint date, and curate a **code + tool** subset only (exclude chat-only MT-Bench-as-sole-metric paths). Ship a tiny offline CI fixture + unit tests. Do **not** vendor the full ~400K corpus; do **not** change `config/release-gates.json` thresholds; do **not** implement the regret/CS report CLI (SP-193) or community-bench (SP-194/SP-195).

## Dependencies

- **None** (builds on landed #101 TwinRouterBench corpus + SP-151/SP-152 harness)

## Context to Read First

- `scripts/eval/fixture-schema.ts` — FrozenCatalog + EvalTier
- `scripts/eval/ingest-twinrouterbench-corpus.ts` — pin/limit/prefer-code-tool pattern
- `scripts/eval/twinrouterbench-adapter.ts` — adapter shape to mirror or map into
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` — provenance pattern
- `scripts/eval/counterfactual-replay.ts` / `harness-tracks.ts` — downstream regret consumers
- GitHub #103 acceptance (code/tool subset + pin)

## Environment

- **Workspace:** `scripts/eval/`, `tests/eval/corpus/`
- **Services required:** None (network only for optional one-shot pin fetch during authoring; CI path must work offline from checked-in fixture)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/ingest-llmrouterbench-subset.ts`, `tests/eval/corpus/llmrouterbench/PROVENANCE.md` |
| May change | `scripts/eval/llmrouterbench-adapter.ts`, `tests/unit/ingest-llmrouterbench-subset.test.ts`, `tests/eval/corpus/llmrouterbench/*.json`, `package.json` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**`, `README.md` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-llmrouterbench-subset.test.ts` |
| fileScopeMustChange | `scripts/eval/ingest-llmrouterbench-subset.ts`, `tests/eval/corpus/llmrouterbench/PROVENANCE.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Pinned LLMRouterBench revision documented; converter emits code/tool-only subset mapped to frozen catalog; tiny CI fixture offline; no full corpus vendored; unit tests cover skip of chat-only paths. |

## Steps

### Step 1: Pin + provenance

- [ ] Record pinned LLMRouterBench HF revision (or git) + license + paper link in `tests/eval/corpus/llmrouterbench/PROVENANCE.md`
- [ ] Document which upstream slices are in-scope (code/tool) vs excluded (chat-only)
- [ ] Document model-ID → frozen catalog map + checkpoint date policy (skip unmappable rows; never invent costs/scores)

### Step 2: Subset converter + CI fixture

- [ ] Add `scripts/eval/ingest-llmrouterbench-subset.ts` (npm script optional) with `--limit N`, code/tool filter, offline fixture output
- [ ] Optional thin `scripts/eval/llmrouterbench-adapter.ts` if a dedicated schema is cleaner than reusing TwinRouterBench/eval fixture shapes — keep interoperable with counterfactual/harness consumers where practical
- [ ] Check in a tiny synthetic/CI fixture under `tests/eval/corpus/llmrouterbench/` (not full dataset); checksum in PROVENANCE
- [ ] Unit tests: synthetic code/tool row → valid output; chat-only row skipped; unmappable model skipped

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/llmrouterbench/PROVENANCE.md` — pin, license, slice filter, catalog map, fixture checksum *(also in File Scope)*

**Check If Affected:**
- `docs/routing-roadmap.md` — §5 offline eval / three-track wording
- `README.md` — leave for SP-193 / SP-195

## Completion Criteria

- [ ] Pin + license documented
- [ ] Code/tool subset converter offline
- [ ] Chat-only paths excluded
- [ ] Full corpus not vendored
- [ ] Gate thresholds untouched
- [ ] Contract + suite green

## Git Commit Convention

- `feat(SP-192): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Implement regret/CS report script (SP-193)
- Implement community-bench CLI (SP-194/SP-195)
- Change `config/release-gates.json` absolute thresholds
- Vendor full HuggingFace / 400K corpus into the repo
- Re-open #95 dogfood protocol or #96 modernbert enablement

## Amendments

None.
