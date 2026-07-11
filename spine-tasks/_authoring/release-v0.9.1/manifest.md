# Release manifest — v0.9.1

**Profile:** patch  
**Package at plan:** 0.9.0 → target 0.9.1  
**Approved:** operator chose P2 #101 only (2026-07-10)

## Composition

| Bucket | Count | Items |
|--------|-------|-------|
| Docs | 0 | (none open) |
| Bugs | 0 | (none open — feature-only override for patch) |
| Features | 1 | #101 → SP-186, SP-187, SP-188 |
| Deferred | 7 | #102 (P2), #103 (P3), #95, #96, #1/#25/#26 hardware |

## Scope IDs

`SP-186,SP-187,SP-188`

## Waves

| Wave | Tasks | Land notes |
|------|-------|------------|
| 0 / A | SP-186 | Manual FF-merge after state_drift (#196) |
| 1 / B | SP-187 | Manual FF-merge after state_drift (#196) |
| 2 / C | SP-188 | Manual FF-merge after state_drift (#196) |

## Profile audit

| Check | Status |
|-------|--------|
| Docs first | PASS (empty) |
| Bugs 3–5 | OVERRIDE (0 open bugs; operator chose P2 #101) |
| Features 0 (patch) | OVERRIDE (1 P2 feature — TwinRouterBench corpus) |
| Total ≤8 S/M | PASS (3 M) |
| P2 focus | PASS (#101 first; #102 deferred) |

## Publish checklist

- [x] All release-scoped tasks `.DONE`
- [x] Issue #101 closed
- [x] `npm run release:check` exit 0 (`/tmp/pi-smart-router-release-check-v091.log`)
- [x] CI green on `52801c8` — https://github.com/beettlle/pi-smart-router/actions/runs/29138332647
- [x] Operator approved publish — `npm version patch` → tag `v0.9.1` → push (`053f8eb`)
- [x] Release workflow / npm publish — https://github.com/beettlle/pi-smart-router/actions/runs/29138376991 (`npm view` = 0.9.1)

## Recovery

All three waves hit pi-spine `state_drift` after `engine.orphan_terminated` (SIGTERM) mid-final-review. Detached `resume --force` failed (`phase running`); attached refused (#163). Landed via FF-merge of `task/spine-lane-1-*` + `.DONE` copy. Upstream: https://github.com/beettlle/pi-spine/issues/196
