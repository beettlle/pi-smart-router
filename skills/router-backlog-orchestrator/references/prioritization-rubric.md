# Backlog prioritization rubric

Use when classifying and ordering work in `router-backlog-orchestrator`.

**Scope:** development **cycle** planning only. Do **not** choose npm bump type (patch/minor/major) or release composition from this rubric — use [`router-release-operator` release profiles](../../router-release-operator/references/release-profiles.md).

## Buckets

### documentation

- GitHub label: `documentation`
- Title/body mentions: README, quickstart, operator guide, env vars, install, dogfooding
- **Always first** in every orchestrator run — process all open doc issues before bugs

### bug

- GitHub label: `bug`
- Keywords: fix, wiring, regression, P0, audit gap, fails, error, crash, missing
- Secondary sort (after docs):
  1. User-facing / session-breaking (routing failures, failover, auth)
  2. CI / verification blockers (lint, typecheck, missing build script)
  3. Correctness / spec drift (pipeline order, ghost layers, swallowed errors)
  4. Internal refactors that unblock other bugs

### feature

- GitHub label: `enhancement` (without `documentation` primary intent)
- New commands, dataset recording, platform support, build tooling enhancements

### epic

- Title contains `[Epic]` or body lists multiple independent deliverables
- **Never** one SP packet — split into S/M tasks with explicit dependencies
- Example: privacy dataset epic → schema → store → opt-in → export (serial chain)

## Feature-to-bug ratio

**Cycle policy** (not a release profile). After documentation bucket is empty for this cycle:

- Queue **3 to 5 bugs**, then **exactly 1 feature**
- One **ratio unit** per orchestrator invocation (default)
- If fewer than 3 bugs remain, queue remaining bugs + at most 1 feature (or 0 features if none left)
- Empty or short bug queues are normal — do not invent fake bugs to fill a 3–5 quota for a **cycle**

Shipping that work as an npm version is a separate step: hand off to `router-release-operator` (patch = docs+bugs only; enhancements require **minor** + theme).

## Dedup rules

1. If `PROMPT.md` contains `GitHub: beettlle/pi-smart-router#N` and task has `.DONE`, skip unless issue reopened
2. If open issue matches pending SP without `.DONE`, do not duplicate — finish existing packet
3. If orphan PROMPT conflicts with GitHub issue, prefer GitHub as source; amend or retire orphan

## Hot-file serialization

These paths must not appear in parallel same-wave `fileScopeMustChange`:

- `.pi/extensions/smart-router/index.ts`
- `src/domain/pipeline/router-pipeline.ts`
- `src/api/middleware/pi-router-middleware.ts`

Chain dependencies in `dependencies.json` when multiple tasks touch the same file.

## Size limits

| Size | Target | Action |
|------|--------|--------|
| S | <2h, ≤4 impl steps | Preferred |
| M | 2–4h | OK if scope disjoint |
| L | 4–8h | Split |
| XL | >8h | Must split |
