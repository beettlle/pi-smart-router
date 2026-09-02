# Release manifest — v0.21.0

**Created:** 2026-09-02
**Current version:** 0.20.0 (package.json; last tag `v0.20.0`)
**Target version:** v0.21.0
**Bump type:** minor
**Profile:** minor
**Theme:** Runtime integrity and operator trust — routing state cannot leak across sessions, telemetry exports are privacy-hardened, and degraded neural stages are explicit instead of silent.
**Operator approved scope:** yes (2026-09-02 — "approve release scope"; Phase 3 author only — no batch/implementation this turn). **Scope expand (2026-09-02):** add SP-254 live leaderboard re-ingest + fleet alias retarget as documentation/hygiene (not a 4th enhancement issue).

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Runtime integrity & operator trust (leak-free sessions, HMAC telemetry, explicit degraded mode) | required | PASS |
| Documentation | 2 (theme docs SP-253 + capability grounding hygiene SP-254) | minor theme docs | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 3 issues (#145, #146, #148) → 6 S packets | minor 1–3 related | PASS |
| Total tasks | 8 | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene:** SP-254 — live public leaderboard re-ingest + Gemini fleet alias retarget (operator-approved scope expand; enhancement issue count unchanged at 3)

**Anti-feature-magnet note:** 21 open issues (all `enhancement`); none used to raise caps. This train ships 3 sibling P1 hardening issues from the same Grok-audit cluster, each split into Size-S packets for higher lane success rate (v0.20 pattern: SP-241→242, SP-234→236). SP-254 is release-tied capability grounding hygiene (not a new enh issue).

**Sizing rationale:** Original draft used 3×M + 1×S. Operator requested S decomposition. Each former M had ≥4 checklist items and mixed concerns (domain API + extension wiring / core hash + CLI contracts / reason codes + fail-closed config). Split at testable seams with explicit deps; optional TTL stays in the wire packet for #145; docs stay last so they match shipped behavior. SP-254 added after Phase 3 as Wave 0 seed (disjoint config/scripts/fixtures).

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-247 | #145 Partial | enh | S | Session-state eviction APIs + unit tests | `LifecycleHookState.evict(sessionId)`; thin helper that clears ledger + lifecycle + accepts `sessionRouting` map; unit tests only — no pi hook yet |
| SP-248 | #145 Closes | enh | S | Wire `session_end` + optional TTL fallback | Depends on SP-247. Register pi `session_end` in `session-lifecycle.ts` / `extension-setup.ts`; call eviction helper; optional orphan TTL; extension tests |
| SP-249 | #146 Partial | enh | S | HMAC-pepper `hashSessionIdForTelemetryExport` | Replace unsalted SHA-256 in `src/infra/telemetry.ts`; reuse `.dataset-key` / dataset-recorder pepper pattern (shared util OK); unit tests for stable-per-install hash |
| SP-250 | #146 Closes | enh | S | CLI dedupe + contrib export contract tests | Depends on SP-249. Point `smart-router-cli.ts` at shared helper; schema version bump if hash format changes; contract tests: no raw `session_id` in export JSONL |
| SP-251 | #148 Partial | enh | S | Missing-weights reason codes (HyDRA + K4) | Emit `hydra_weights_missing` / `k4_heads_placeholder` into decision metadata (not stderr-only); unit tests for both matchers; shared reason-code constants |
| SP-252 | #148 Closes | enh | S | `fail_closed_on_missing_weights` + sandwich integration | Depends on SP-251. Operator config + Zod; integrate with degraded neural sandwich (#119) reason codes; unit tests for fail-closed path |
| SP-253 | — (theme docs) | doc | S | Operator docs for runtime-integrity theme | Depends on SP-248, SP-250, SP-252. README long-session note, export-hash migration note, degraded-mode reason-code table |
| SP-254 | — (hygiene) | doc | S | Live leaderboard re-ingest + Gemini fleet aliases | Wave 0 seed. `routing:ingest-benchmarks -- --live`; retarget `gemini-flash-latest` / lite / `gemini-3.1-pro-preview`; update `DEFAULT_FLEET_BENCHMARK_ALIASES`; never invent scores |

**Issue → packet status:** #145/#146/#148 have no existing SP-* mapping → authored in Phase 3. Enhancement **issue** count remains 3 (profile cap); task count is **8** after S-split + SP-254 hygiene.

**File-scope disjointness (wave 0 seeds):**
- SP-247: `src/api/middleware/pi-router-middleware.ts`, `src/domain/delegation/execution-ledger.ts`, new small helper under `src/` or extension types
- SP-249: `src/infra/telemetry.ts`, optionally `src/infrastructure/telemetry/dataset-recorder.ts` (pepper reuse)
- SP-251: `src/domain/matching/hydra-matcher.ts`, `src/domain/matching/modernbert-heads.ts`, decision/types touched for reason codes
- SP-254: `config/benchmark-profiles.json`, `scripts/ingest-benchmark-profiles.ts`, recorded fixtures, mapper coverage tests / `docs/capability-profile-coverage.md`

Wave-1 dependents stay on the same issue lanes (no cross-issue file fights). SP-254 does **not** block SP-253.

**Release scope ID:** `SP-247,SP-248,SP-249,SP-250,SP-251,SP-252,SP-253,SP-254`

**Dependencies (author into `dependencies.json` in Phase 3):**

```text
SP-247: []
SP-248: [SP-247]
SP-249: []
SP-250: [SP-249]
SP-251: []
SP-252: [SP-251]
SP-253: [SP-248, SP-250, SP-252]
SP-254: []
```

---

## Sequence runner (Phase 4)

The manifest is the operator contract; the CLI takes the **scope ID string**, not the manifest file path.

```bash
spine tasks validate SP-247 SP-248 SP-249 SP-250 SP-251 SP-252 SP-253 SP-254
spine plan SP-247,SP-248,SP-249,SP-250,SP-251,SP-252,SP-253,SP-254
spine run sequence SP-247,SP-248,SP-249,SP-250,SP-251,SP-252,SP-253,SP-254 --dry-run
spine run sequence SP-247,SP-248,SP-249,SP-250,SP-251,SP-252,SP-253,SP-254    # detached — omit --attached
```

**Regression gate** (after each integrate, before next wave):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates** (human only):

1. Approve this manifest (operator sign-off on scope + theme)
2. `spine gate approve` per integrate wave
3. Publish approval before **exactly one** `npm version minor` (after `release:assert-content` PASS)

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| #145 Partial | enh | SP-247 | create-spine-tasks (lean) |
| #145 Closes | enh | SP-248 | create-spine-tasks (lean) |
| #146 Partial | enh | SP-249 | create-spine-tasks (lean) |
| #146 Closes | enh | SP-250 | create-spine-tasks (lean) |
| #148 Partial | enh | SP-251 | create-spine-tasks (lean) |
| #148 Closes | enh | SP-252 | create-spine-tasks (lean) |
| — (theme docs) | doc | SP-253 | create-spine-tasks (lean) |
| — (hygiene) | doc | SP-254 | create-spine-tasks (lean) |

---

## Wave plan snapshot

```text
Spine plan — ids (SP-247,SP-248,SP-249,SP-250,SP-251,SP-252,SP-253,SP-254)
8 task(s) · 3 wave(s) · maxParallel 3

Wave 0 · 4 tasks · 2 rounds (queued by maxParallel)
  Round 1 (3 parallel):
    Lane 1: SP-247 — Session-state eviction APIs + unit tests
    Lane 2: SP-249 — HMAC-pepper hashSessionIdForTelemetryExport
    Lane 3: SP-251 — Missing-weights reason codes (HyDRA + K4)
  Round 2:
    Lane 1: SP-254 — Live leaderboard re-ingest + Gemini fleet aliases

Wave 1 · 3 tasks · 3 lanes in parallel
  Lane 1: SP-248 — Wire session_end + optional TTL fallback
  Lane 2: SP-250 — CLI dedupe + contrib export contract tests
  Lane 3: SP-252 — fail_closed_on_missing_weights + sandwich integration

Wave 2 · 1 task
  Lane 1: SP-253 — Operator docs for runtime-integrity theme
```

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #147 | enh | Ready | ONNX pinning + embedder dispose — fits hardening theme but enhancement issue cap (3) reached; first pick for next train |
| #144 | enh | Ready | Extension coverage gate — CI infra, next hardening minor |
| #143 | enh | Funnel | Split 2005-line RouterPipeline — L-sized, needs split into per-stage packets |
| #149 | enh | Funnel | Public facade replacing 70+ deep imports — L-sized, needs split |
| #151 / #155 / #150 / #154 | enh | Ready/Funnel | P2 test/eng hygiene — backlog-orchestrator cycles, not this train |
| #157 / #156 / #162 / #163 | enh | Funnel | P2/P3 toolchain/deps — hygiene theme or backlog cycle |
| #167 | enh | Funnel | P2 Granite encoder dogfood — separate capability theme |
| #95 | enh | Parked | P0 shadow dogfood — requires human-run dogfood sessions |
| #96 | enh | Funnel | K4 default flip — blocked on trained weights + enablement decision (#148 complements it) |
| #110 | enh | Funnel | P(success) holdout growth — needs data volume |
| #1 / #25 / #26 | epic | Parked | Hardware — physical access required |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #147 | Encoder supply-chain integrity (ONNX pinning, embedder lifecycle) | Ready |
| #144 | Measurement honesty (extension coverage gate) | Ready |
| #143 (split) | RouterPipeline stage decomposition + ports | Funnel |
| #149 (split) | Extension public facade | Funnel |
| #151 | Hardware probe unit-test coverage | Ready |

Open-issue count (21) did **not** raise this release's enhancement or total-task caps.

---

## Risks and blockers

- #146 changes exported hash format → SP-250 owns schema version bump; SP-253 owns operator migration note; contract tests must pin stable-per-install behavior
- #148 adds decision-metadata fields → SP-251 must keep explain sidecar consumers tolerant; SP-252 touches sandwich knobs from #119
- #145 / SP-248 depends on discovering the correct pi `session_end` lifecycle API — if API is unclear, fail the packet with a clear blocker note rather than inventing a hook
- Three parallel Wave-1 lanes all touch tests/ — watch vitest shard name collisions (known spine hazard, low risk)
- Extra integrate waves vs 3×M: accept ~1 extra gate for higher per-lane success probability
- SP-254 live ingest may fail open to recorded/fixtures; never invent scores; aliases may only target existing `models[].model_id` (else intentional `pattern_default` + rationale). Does not block integrity packets.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave** (log paths recorded)
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD` (exit 0 verified)
- [ ] `npm run release:assert-content` green (substantive delta vs `v0.20.0`)
- [ ] Manifest target == expected next version from `package.json` (0.20.0 + minor = 0.21.0)
- [ ] No existing git tag `v0.21.0` (verified: tags end at `v0.20.0`)
- [ ] CI workflow green on `HEAD` (`gh run list` / `gh run watch`)
- [ ] `git status` clean
- [ ] Operator approved publish bump type: **minor** (matches Phase 2)
- [ ] **Exactly one** `npm version minor` then `git push && git push --tags` — then **STOP** (no second bump)
- [ ] `release.yml` succeeded; `npm view` `latest` matches `0.21.0` (else Publish recovery, do not re-bump)
