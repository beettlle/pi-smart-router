## Summary

Reconcile operator example config, README, quickstart, and routing roadmap with 0.16.2 runtime reality.

## Priority

P2

## Pipeline stages

`config/operator-config.json.example`, `README.md`, `specs/001-build-smart-router/quickstart.md`, `docs/routing-roadmap.md`

## Problem / motivation

`operator-config.json.example` fails `OperatorConfigSchema` (missing `planning_delegate.global_timeout_ms` / `sub_call_timeout_ms`). README banner still says v0.1.0; quickstart claims dataset “not implemented” and Node 20; roadmap dated 2026-07-11 with stale #108 reference (closed #109 attempted sync — still drift).

## Proposed solution

- [ ] Fix `config/operator-config.json.example` to validate via `OperatorConfigSchema.parse()` in CI test.
- [ ] Update README version banner to match `package.json` (0.16.2+).
- [ ] Mark `SMART_ROUTER_DATASET=1` as shipped in quickstart; fix Node ≥22.
- [ ] Refresh `docs/routing-roadmap.md` “Last updated” + closed issue pointers (#108→#124, etc.).
- [ ] Add 0.17 audit backlog table placeholder (filled when issue numbers assigned).
- [ ] Update pipeline ASCII to include `triage_cloud_fallback` and key 0.16 stages.

## Evidence

- Audit Grok/Sonnet docs drift sections
- Closed #109 — follow-on needed

## Dependencies

| Issue | Role |
|-------|------|
| #109 (closed) | Prior docs sync — this supersedes remaining drift |

## Out of scope

- Implementing routing features
- Changing release gates

## Verification

```bash
npm run typecheck
# New or extended test loading operator-config.json.example through Zod
npm run lint
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Docs-only PR | Autonomous |
