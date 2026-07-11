# Release manifest — v0.9.0

**Profile:** minor  
**Package at plan:** 0.8.0 → target 0.9.0  
**Approved:** operator (P1 #100; follow-on #104 adapters; defer P2 #101/#102 and #95/#96/#103/hardware)

## Composition

| Bucket | Count | Items |
|--------|-------|-------|
| Docs | 0 | (none open) |
| Bugs | 0 | (none open — feature-only override; #104 fixed live HTML fail-fast) |
| Features | 2 | #100 → SP-179, SP-180; #104 → SP-181–SP-185 |
| Deferred | 8 | #101, #102 (P2), #103 (P3), #95, #96, #1/#25/#26 hardware |

## Scope IDs

`SP-179,SP-180,SP-181,SP-182,SP-183,SP-184,SP-185`

## Waves

| Wave | Tasks |
|------|-------|
| 0 / A | SP-179 |
| 1 / B | SP-180 |
| 2 / C | SP-181 |
| 3 / D | SP-182, SP-183, SP-184 |
| 4 / E | SP-185 |

## Profile audit

| Check | Status |
|-------|--------|
| Docs first | PASS (empty) |
| Bugs 3–5 | OVERRIDE (0 open bugs; operator chose P1 feature-only) |
| Features 1–2 | PASS (#100 + #104 follow-on adapters) |
| Total ≤15 S/M | PASS (7 M) |
| P1/P2 focus | PASS (P1 #100 + follow-on #104; P2 deferred) |

## Publish checklist

- [x] All release-scoped tasks `.DONE`
- [x] Issues #100, #104 closed
- [x] `npm run release:check` exit 0 (`/tmp/pi-smart-router-release-check-v090.log`)
- [x] CI green on `e2ef770` — https://github.com/beettlle/pi-smart-router/actions/runs/29133939099
- [x] Operator approved publish — `npm version 0.9.0` → tag `v0.9.0` → push (`161a83d`)
- [ ] Release workflow / npm publish — https://github.com/beettlle/pi-smart-router/actions/runs/29134010308
