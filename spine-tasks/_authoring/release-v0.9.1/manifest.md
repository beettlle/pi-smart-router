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

| Wave | Tasks |
|------|-------|
| 0 / A | SP-186 |
| 1 / B | SP-187 |
| 2 / C | SP-188 |

## Profile audit

| Check | Status |
|-------|--------|
| Docs first | PASS (empty) |
| Bugs 3–5 | OVERRIDE (0 open bugs; operator chose P2 #101) |
| Features 0 (patch) | OVERRIDE (1 P2 feature — TwinRouterBench corpus) |
| Total ≤8 S/M | PASS (3 M) |
| P2 focus | PASS (#101 first; #102 deferred) |

## Publish checklist

- [ ] All release-scoped tasks `.DONE`
- [ ] Issue #101 closed
- [ ] `npm run release:check` exit 0
- [ ] CI green on release commit
- [ ] Operator approved publish — `npm version patch` → tag → push
- [ ] Release workflow / npm publish verified
