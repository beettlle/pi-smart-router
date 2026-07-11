# Release manifest — v0.9.3

**Profile:** patch  
**Package at plan:** 0.9.2 → target 0.9.3  
**Approved:** operator chose P3 #103 + #105 (2026-07-11) — SP-192–SP-195

## Composition

| Bucket | Count | Items |
|--------|-------|-------|
| Docs | 0 | (none open) |
| Bugs | 0 | (none open — feature-only override for patch) |
| Features | 2 | #103 → SP-192, SP-193; #105 → SP-194, SP-195 |
| Deferred | 5 | #95, #96, #1/#25/#26 hardware |

## Scope IDs

`SP-192,SP-193,SP-194,SP-195`

## Waves

| Wave | Tasks | Land notes |
|------|-------|------------|
| 0 / A | SP-192, SP-194 | batch `20260711T181634` → integrate `59b556f`; `release:check` exit 0; pushed |
| 1 / B | SP-193 | batch `20260711T182552` → integrate `939f7f5`; #103 closed; `release:check` exit 0; pushed |
| 2 / C | SP-195 | batch `20260711T183109` → integrate `b314fd1`; #105 closed |

## Profile audit

| Check | Status |
|-------|--------|
| Docs first | PASS (empty) |
| Bugs 3–5 | OVERRIDE (0 open bugs; operator chose P3 features) |
| Features 0 (patch) | OVERRIDE (2 P3 features — LLMRouterBench + community bench) |
| Total ≤8 S/M | PASS (4 M) |
| P3 + #105 focus | PASS |

## Publish checklist

- [x] All release-scoped tasks `.DONE` (SP-192–SP-195)
- [x] Issues #103 and #105 closed
- [x] `npm run release:check` exit 0 — `/tmp/pi-smart-router-v093-final-release-check.log` + prebump recheck exit 0
- [x] CI green on `57f6ce2` — [run 29163821696](https://github.com/beettlle/pi-smart-router/actions/runs/29163821696) success
- [x] Operator approved publish (wait for CI first) — `npm version patch` → tag `v0.9.3` → push
- [ ] Release workflow / npm publish

## Recovery

(none yet)
