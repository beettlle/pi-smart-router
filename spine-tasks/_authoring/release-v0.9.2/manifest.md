# Release manifest — v0.9.2

**Profile:** patch  
**Package at plan:** 0.9.1 → target 0.9.2  
**Approved:** operator chose P2 #102 only (2026-07-11) — SP-189–SP-191

## Composition

| Bucket | Count | Items |
|--------|-------|-------|
| Docs | 0 | (none open) |
| Bugs | 0 | (none open — feature-only override for patch) |
| Features | 1 | #102 → SP-189, SP-190, SP-191 |
| Deferred | 7 | #103 (P3), #95, #96, #105, #1/#25/#26 hardware |

## Scope IDs

`SP-189,SP-190,SP-191`

## Waves

| Wave | Tasks | Land notes |
|------|-------|------------|
| 0 / A | SP-189 | pending |
| 1 / B | SP-190 | pending |
| 2 / C | SP-191 | pending |

## Profile audit

| Check | Status |
|-------|--------|
| Docs first | PASS (empty) |
| Bugs 3–5 | OVERRIDE (0 open bugs; operator chose P2 #102) |
| Features 0 (patch) | OVERRIDE (1 P2 feature — label packs) |
| Total ≤8 S/M | PASS (3 M) |
| P2 focus | PASS (#102 only) |

## Publish checklist

- [ ] All release-scoped tasks `.DONE`
- [ ] Issue #102 closed
- [ ] `npm run release:check` exit 0
- [ ] CI green on release commit
- [ ] Operator approved publish — `npm version patch` → tag `v0.9.2` → push
- [ ] Release workflow / npm publish

## Recovery

(none yet)
