# Task: SP-237 — Document library vs extension feature parity gap

**Created:** 2026-08-28
**Size:** S

## Review Level: 0

**Assessment:** Docs-only — README section documenting extension-only capabilities vs `createRouter()` library path.
**Score:** 0/8 (docs only, no code)

## Source

- GitHub: beettlle/pi-smart-router#153
- Bucket: documentation
- Release: v0.19.1
- Manifest: `spine-tasks/_authoring/release-v0.19.1/manifest.md`

## Mission

Closes #153 — Document the feature parity gap between the library API (`createRouter()` / `createRouterFromFleet()` / `GatewayDispatch`) and the pi extension production path. Extension-only capabilities (planning delegate spawn, stream failover loop, output headroom escalation, cursor quota handling) must be listed explicitly so npm embedders know they get a thinner product. Cross-link #149 (extension public facade) as the migration plan for closing the gap over time. No application code changes.

## Dependencies

- None

## Context to Read First

- `README.md` — existing "Install" (Via pi / Via npm), "Fleet behavior", "Optional: YAML fleet (library API)", "Concurrency contract" sections
- `.pi/extensions/smart-router/route-and-delegate.ts` — extension stream failover loop (~377–595)
- `.pi/extensions/smart-router/planning-delegate.ts` — planning delegate spawn (extension-only)
- `src/api/middleware/pi-router-middleware.ts` — lifecycle stub vs extension stream path
- `src/index.ts` — library public exports

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `docs/routing-roadmap.md` (one-line cross-link only) |
| Must NOT change | `src/**`, `.pi/**`, `config/**`, `tests/**`, `scripts/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/route-and-delegate.ts` |
| completionCriteria | README "Library vs extension" section lists extension-only capabilities with source-file evidence; recommended integration path for pi vs npm embedders documented; cross-link to #149 migration plan; middleware stub vs extension stream path noted; #153 closable |

## Steps

### Step 1: Author "Library vs extension" section in README

- [ ] New `## Library vs extension` section (place after "Concurrency contract" / before "Fleet behavior")
- [ ] Capability table: planning delegate spawn, stream failover loop, output headroom escalation, cursor quota handling — each row: capability, extension path (file), library status (stub/thinner)
- [ ] Note `src/api/middleware/pi-router-middleware.ts` lifecycle stub vs `.pi/extensions/smart-router/route-and-delegate.ts` stream path
- [ ] Cross-link #149 (extension facade) as the migration plan for closing the gap
- [ ] Recommended integration path: pi extension (full product) vs npm `createRouter()` (library core)

### Step 2: Optional diagram + roadmap cross-link

- [ ] ASCII or mermaid diagram of the two integration paths (small, README-embedded)
- [ ] One-line pointer in `docs/routing-roadmap.md` if it aids discovery (optional)

### Step 3: Testing and verification

- [ ] Run `npm test` (full suite — docs-only, must stay green)
- [ ] Verify README internal anchors/links resolve (relative links + GitHub issue links #149, #153)

## Completion Criteria

- [ ] `## Library vs extension` section present in README with the four extension-only capabilities
- [ ] Integration path guidance for pi vs npm embedders
- [ ] #149 cross-linked as migration plan; middleware stub noted
- [ ] #153 closable

## Do NOT

- Implement parity in the library (that is #149 / B7 scope)
- Touch `src/**`, `.pi/**`, `config/**`, `tests/**`, `scripts/**`
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
