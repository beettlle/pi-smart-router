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
| 0 / A | SP-189 | batch `20260711T034743` → integrate `36cfd6f`; lint fix `0f87f07` |
| 1 / B | SP-190 | batch `20260711T035535` → integrate `7f96bec`; contract amend `58f6f01` |
| 2 / C | SP-191 | batch `20260711T040426` → integrate `d085376` |

## Profile audit

| Check | Status |
|-------|--------|
| Docs first | PASS (empty) |
| Bugs 3–5 | OVERRIDE (0 open bugs; operator chose P2 #102) |
| Features 0 (patch) | OVERRIDE (1 P2 feature — label packs) |
| Total ≤8 S/M | PASS (3 M) |
| P2 focus | PASS (#102 only) |

## Publish checklist

- [x] All release-scoped tasks `.DONE` (SP-189, SP-190, SP-191)
- [x] Issue #102 closed
- [x] `npm run release:check` exit 0 — monitor #29 exit 0; log `/tmp/pi-smart-router-v092-release-check.log` (coverage ~92.9%; consumer-pack + functional-smoke + release-gates PASS)
- [ ] CI green on release commit — **requires `git push origin main` first** (local HEAD `cba5698`, ahead 19)
- [ ] Operator approved publish — `npm version patch` → tag `v0.9.2` → push
- [ ] Release workflow / npm publish

## Recovery

SP-189 post-integrate: unused `readFileSync` lint → fixed on main (`0f87f07`). SP-190: prelanded `fileScopeMustChange` on PROVENANCE → amended (`58f6f01`).
