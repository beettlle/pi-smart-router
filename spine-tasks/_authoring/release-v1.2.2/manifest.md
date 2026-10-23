# Release manifest — v1.2.2

**Created:** 2026-10-22
**Current version:** 1.2.1 (npm `latest` 1.2.1)
**Target version:** v1.2.2
**Bump type:** patch
**Profile:** patch
**Theme:** glm-5.3-flash runaway hardening (epic #182) — stop Cursor lifecycle replay, make context-fit admits diagnosable and the estimate honest, and fix the HyDRA loop flag.
**Operator approved scope:** yes (2026-10-22, #180, #178, #186)

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | glm runaway hardening | required | PASS |
| Documentation | 0 | patch 0–2 | PASS |
| Bug fixes | 3 issues (#180, #178 split in 2, #186) | soft 1–5 | PASS |
| Enhancements | 0 | patch **0** | PASS |
| **Total tasks** | 4 packets | patch ≤8 | PASS |

**Profile audit:** PASS

---

## Dependency freshness (Phase 1 — required)

Inventory on 2026-10-22: `npm view @earendil-works/pi-ai version` (1.4.0), `npm view @earendil-works/pi-coding-agent version` (1.4.0), `npm outdated`.

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | dev ^1.3.0 + peer `*` (optional) | 1.4.0 | no bump (in-range) |
| `@earendil-works/pi-coding-agent` | dev ^1.3.0 + peer `*` (optional) | 1.4.0 | no bump (in-range) |
| `@huggingface/transformers`, `yaml`, `zod`, `tsx` | caret | patch/minor ahead | no bump (in-range) |
| `better-sqlite3`, `typescript`, `vitest`, `eslint`, `@types/*` | — | majors | Defer #162 / #163 / #157 |

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-300 | #180 | bug | M | Strip Cursor lifecycle thinking on cross-provider delegation | Closes #180 |
| SP-301 | #178 | bug | S | Persist context-fit telemetry fields | Partial #178 (observability) |
| SP-302 | #178 | bug | M | Input-token estimate counts tool-call args, replayed thinking, last usage | Closes #178 |
| SP-303 | #186 | bug | S | HyDRA loop flag reuses loop-escalation failure detection | Closes #186 |

**Release scope ID:** `SP-300,SP-301,SP-302,SP-303`

File scopes are disjoint; no dependency edges.

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-300 SP-301 SP-302 SP-303
spine plan SP-300,SP-301,SP-302,SP-303
spine batch start <wave ids>    # detached
```

**Regression gate** (after each integrate):

```bash
SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 npm run release:check > /tmp/pi-smart-router-post-integrate-v122-wave-${WAVE}.log 2>&1
```

**Quota policy:** if a Kimi 429 appears in worker output, restart the wave with `SPINE_AGENT_PROFILE_OVERRIDE=budget` (pi-spine#367 blocks the automatic fallback) and record the override here.

---

## Wave plan snapshot

```text
spine plan SP-300,SP-301,SP-302,SP-303 — 4 tasks · 1 wave · maxParallel 2
Round 1: SP-300, SP-301
Round 2: SP-302, SP-303
```

---

## Deferred backlog

| Item | Type | Rationale |
|------|------|-----------|
| #181, #179 | enh | Epic #182 enhancements — minor |
| #183–#185, #187–#191 | enh | Typed-judgment epic — minor (1.3.0 train) |
| #110, #95, #96, #167, #172, #151 | enh | Routing/eval — minor |
| #162, #163, #157, #156 | chore/deps | Toolchain majors |
| #1, #25, #26 | epic | Hardware — parked |

---

## Risks

- SP-300: removing Cursor thinking changes what non-Cursor targets see; Cursor→Cursor and non-Cursor thinking must be untouched.
- SP-302: a higher estimate rejects more models at context fit; that is the intended fix, but verify existing context-fit tests still describe intended behavior.
- SP-301: SQLite migration on existing user databases — must be additive (`ALTER TABLE … ADD COLUMN`) and idempotent.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after each wave
- [ ] `spine preflight` green
- [ ] `npm run release:assert-content` green
- [ ] No existing git tag `v1.2.2`
- [ ] CI green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: patch
- [ ] Exactly one `npm version patch`, push commit + tag
- [ ] `release.yml` staged publish succeeded; operator approved on npm; `latest` == 1.2.2
