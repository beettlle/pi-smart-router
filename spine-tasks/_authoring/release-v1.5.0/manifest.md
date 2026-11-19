# Release manifest — v1.5.0

**Created:** 2026-11-19
**Current version:** 1.4.0
**Target version:** v1.5.0
**Bump type:** minor
**Profile:** minor
**Theme:** Dogfood stability + typed-judgment consumers — close remaining #182 guards (#179/#181), ship #188 tier/local_zero consumers (Partial #183), and fix #194 unparseable-delegation failure recording.
**Operator approved scope:** yes (2026-11-19 — operator approved minor 1.5.0; author packets + push; pause before batch)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Dogfood stability + typed-judgment consumers | required | PASS (operator merged two prior next-train themes) |
| Documentation | 1 (operator note for #188 / Partial #183) | minor theme docs | PASS |
| Bug fixes | 2 (#194 code; #182 epic via #179/#181 + bookkeeping) | soft | PASS |
| Enhancements | 3 (#179, #181, #188) — #183 Partial via #188 | minor 1–3 related | PASS (at cap) |
| **Total tasks** | 9 (proposed SP-320–SP-328) | minor ≤15 | PASS |

**Profile audit:** PASS (enhancement count at hard cap of 3; no extra Sprint 2 children)

**Hygiene:** none (no dep majors; peers Current)

**Explicitly out of this train (operator did not request):** #189, #190, #191 (remaining #183 Sprint 2). #194 is included as the only open actionable correctness bug adjacent to failover.

---

## Dependency freshness (Phase 1 — required)

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | ^1.5.2 | 1.5.2 | Current |
| `@earendil-works/pi-coding-agent` | ^1.5.2 | 1.5.2 | Current |
| `@huggingface/transformers` | ^4.2.0 | 4.3.2 | no bump (in-range lag) |
| `better-sqlite3` | ^12.11.1 | 13.2.0 | Defer #162 |
| `yaml` | ^2.9.0 | 2.9.1 | no bump |
| `zod` | ^4.4.3 | 4.6.7 | no bump |
| `typescript` | ^5.8.3 | 7.0.2 | Defer #163 |
| `vitest` / `@vitest/coverage-v8` | ^3.2.3 | 5.x | Defer #163 |
| `eslint` | ^8.57.1 | 10.x | Defer #157 |
| `tsx` | ^4.23.0 | 4.23.15 | no bump |
| `@types/node` | ^22.15.21 | 26.x | Defer #163 |

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-320 | #194 | bug | S | Parse `"NNN: {json}"` provider errors; stop false 5xx-from-body | Partial #194 |
| SP-321 | #194 | bug | S | Never record failed delegation as success; single `recordOutcome` | Partial #194 |
| SP-322 | #194 | bug | M | Model repeated non-infra failure counter + in-turn failover | Closes #194 |
| SP-323 | #179 | enh | M | Session-depth / flash-class main_loop capability floor | Partial #179; Partial #182 |
| SP-324 | #179 | enh | S | Re-check model on first tool_result after cross-provider handoff | Closes #179; Partial #182 |
| SP-325 | #181 | enh | M | Degenerate output detect (length + no toolCall + repetition) → failover | Closes #181; Partial #182 |
| SP-326 | #188 | enh | M | Typed-judgment tier hints + planning override consumers | Partial #188; Partial #183; after SP-324 |
| SP-327 | #188 | enh | M | Typed-judgment local_zero destructive/tool_use gates + low-confidence guard | Closes #188; Partial #183 |
| SP-328 | #183 | doc | S | Operator docs: Sprint 2 consumer table + #188 enablement | Partial #183 (docs) |

**Release scope ID:** `SP-320,SP-321,SP-322,SP-323,SP-324,SP-325,SP-326,SP-327,SP-328`

**Epic bookkeeping after land:**
- Close #182 when #179+#181 done (children #177/#178/#180 already closed).
- Leave #183 open until remaining Sprint 2 (#189/#190/#191) or operator closes foundation+consumers scope.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-320 SP-321 SP-322 SP-323 SP-324 SP-325 SP-326 SP-327 SP-328
spine plan SP-320,SP-321,SP-322,SP-323,SP-324,SP-325,SP-326,SP-327,SP-328
spine run sequence SP-320,SP-321,SP-322,SP-323,SP-324,SP-325,SP-326,SP-327,SP-328 --dry-run
```

Serialize hot files across waves: `.pi/extensions/smart-router/index.ts`, `src/domain/pipeline/router-pipeline.ts`, `src/api/middleware/pi-router-middleware.ts`, `.pi/extensions/smart-router/delegate-stream.ts`, `src/infrastructure/delegation/provider-error.ts`.

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #194 | bug | SP-320–SP-322 | create-spine-tasks (lean) |
| #179 | enh | SP-323–SP-324 | create-spine-tasks (lean) |
| #181 | enh | SP-325 | create-spine-tasks (lean) |
| #188 | enh | SP-326–SP-327 | create-spine-tasks (lean) |
| #183 | doc Partial | SP-328 | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
(from `spine plan pending` 2026-11-19)
Wave 0: SP-320 ‖ SP-321 → SP-323
Wave 1: SP-322 ‖ SP-324
Wave 2: SP-325 ‖ SP-326
Wave 3: SP-327
Wave 4: SP-328
```

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #189, #190 | enh | Ready | #183 Sprint 2 remainder — next typed-judgment train |
| #191 | eval | Funnel | Needs operator judgment cache + #188/#189 |
| #95 | P0 enh | Funnel / human | Protocol shipped; live dogfood floor unmet — keep open |
| #110 | P1 enh | Funnel / human | Verifier-grade ship done; HyDRA ≥100 + human volume remain |
| #96, #167, #172 | enh/eval | Funnel | Encoder / baseline track |
| #1 / #25 / #26 | epic | Parked | Hardware |
| #162, #163, #157, #156 | chore/deps | Ready | Hygiene theme |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #189, #190 | Typed-judgment consumers: HyDRA requirements + adaptive reasoning | Ready |
| #191 | Typed-judgment eval + latency decision artifact | Funnel |
| #95 | Live shadow dogfood evidence window (human) | Funnel |
| #110 | HyDRA embedding floor + session-holdout ECE ship | Funnel |
| #162 | better-sqlite3 v13 hygiene | Ready |

Open-issue count must **not** raise this release’s enhancement or total-task caps.

---

## #95 / #110 AC decision (2026-11-19)

| Issue | Close? | Rationale |
|-------|--------|-----------|
| #95 | **No** | Protocol + soft-feed + README links landed; issue checkboxes for live dual-gate dogfood + frugality sign-off still unmet (0 human windows in SP-267 artifact; prior ship notes keep open). |
| #110 | **No** | Docs + verifier-grade `routing-calibration.json` / p-success shipped (v1.1); remaining AC: HyDRA ≥100 embeddings, broader #95 volume, session-holdout ECE ship-clear. |

Comments posted on both issues with this decision (no close).

---

## Risks and blockers

- Two historical themes merged by operator — stay at exactly 3 enhancements; do not pull #189/#191 into this train.
- Hot-file serialization on pipeline + extension delegation paths.
- #188 depends on typed_judgment stage already on main (v1.3.0) — verify stage present before consumer packets.
- #181 labeled P2 but operator-included to finish #182; counts toward enhancement cap.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave**
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD`
- [ ] `npm run release:assert-content` green
- [ ] Manifest target == expected next version (`1.4.0` + minor → `1.5.0`)
- [ ] No existing git tag `v1.5.0`
- [ ] CI green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **minor**
- [ ] Exactly one `npm version minor` then push tags — STOP
- [ ] `release.yml` succeeded; `npm view` latest == `1.5.0`
