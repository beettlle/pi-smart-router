# Release manifest — v1.1.0

**Created:** 2026-09-10
**Current version:** 1.0.0
**Target version:** v1.1.0
**Bump type:** minor
**Profile:** minor
**Theme:** Post-1.0 verifier-graded calibration — provenance floors, adversarial LLM labels, hard-gate ship of trained artifacts (honest-untrained remains until gates pass).
**Operator approved scope:** yes (2026-09-10 — implement plan)

**Supersedes:** `spine-tasks/_authoring/release-v1.0.1/` (patch naming invalid for enhancement content; retargeted to minor).

---

## Composition audit

| Bucket | Selected | Profile limit | Status |
|--------|----------|---------------|--------|
| Theme | Post-1.0 verifier-graded calibration | required | PASS |
| Documentation | theme docs via SP-284 + SP-286 | minor theme docs | PASS |
| Bug fixes | 0 | soft; 0 OK if none open | PASS (no open bugs) |
| Enhancements | 3 (#168, #169, #170) | minor 1–3 related | PASS |
| **Total tasks** | 7 | minor ≤15 | PASS |

**Profile audit:** PASS

**Hygiene (patch only, if any):** none (minor profile)

---

## Dependency freshness (Phase 1 — required)

| Package | Declared | npm latest | Action this train |
|---------|----------|------------|-------------------|
| `@earendil-works/pi-ai` | ^0.85.1 | 0.85.1 | Current |
| `@earendil-works/pi-coding-agent` | ^0.85.1 (dev) / peer `*` | 0.85.1 | Current |
| `@huggingface/transformers` | ^4.2.0 | 4.2.0 | Current |
| `better-sqlite3` | ^12.11.1 | 13.0.3 | Defer #162 (major) |
| `yaml` | ^2.9.0 | 2.9.0 | Current |
| `zod` | ^4.4.3 | 4.6.2 | no bump (in-range lag) |
| `typescript` | ^5.8.3 | 7.0.2 | Defer #163 (major) |
| `vitest` | ^3.2.3 | 5.0.0 | Defer #163 (major) |
| `eslint` | ^8.57.1 | 10.10.0 | Defer #157 (flat config) |
| `tsx` | ^4.23.0 | 4.23.13 | no bump (in-range lag) |
| `@types/node` | ^22.15.21 | 22.20.2 | no bump (in-range lag) |

---

## Selected tasks

| SP-ID | Issue | Bucket | Size | Title | Notes |
|-------|-------|--------|------|-------|-------|
| SP-280 | #110 | chore | S | v1.1.0 manifest scaffold | Parent bookkeeping |
| SP-281 | #168 | enh | M | label provenance floors | Partial #168 |
| SP-282 | #169 | enh | M | adversarial labeling harness | Closes #169 |
| SP-283 | #168 | enh | M | verifier-grade train | Partial #168 |
| SP-284 | #168 | enh | M | hard-gate ship bundle | Closes #168 if gates pass |
| SP-285 | #170 | enh | M | privacy-safe embedding export | Closes #170 |
| SP-286 | #110 | docs | S | operator notes issues | Links #168–#172; no #96 flip |

**Release scope ID:** SP-280,SP-281,SP-282,SP-283,SP-284,SP-285,SP-286

---

## Sequence runner (Phase 4)

```bash
spine tasks validate SP-280 SP-281 SP-282 SP-283 SP-284 SP-285 SP-286
spine plan SP-280,SP-281,SP-282,SP-283,SP-284,SP-285,SP-286
spine run sequence SP-280,SP-281,SP-282,SP-283,SP-284,SP-285,SP-286 --dry-run
spine run sequence SP-280,SP-281,SP-282,SP-283,SP-284,SP-285,SP-286
```

**Regression gate** (after each integrate):

```bash
npm run release:check 2>&1 | tee /tmp/pi-smart-router-post-integrate-wave-${WAVE:-main}.log
test "${PIPESTATUS[0]}" -eq 0
```

**Operator gates:**

1. Approve this manifest (operator sign-off on scope + theme) — done 2026-09-10
2. `spine gate approve` per integrate wave
3. Publish approval before exactly one `npm version minor`

---

## Gaps requiring new packets

| Issue | Bucket | Proposed SP-ID | Author with |
|-------|--------|----------------|-------------|
| — | — | — | none (SP-280–SP-286 already authored) |

---

## Wave plan snapshot

```text
Spine plan — ids
7 task(s) · 6 wave(s) · maxParallel 3

Wave 0 · 1 task
  Lane 1: SP-280 — v1.0.1 manifest scaffold

Wave 1 · 2 tasks · 2 lanes in parallel
  Lane 1: SP-281 — label provenance floors
  Lane 2: SP-285 — privacy-safe embedding export

Wave 2 · 1 task
  Lane 1: SP-282 — adversarial labeling harness

Wave 3 · 1 task
  Lane 1: SP-283 — verifier-grade train

Wave 4 · 1 task
  Lane 1: SP-284 — hard-gate ship bundle

Wave 5 · 1 task
  Lane 1: SP-286 — operator notes issues
```

---

## Deferred backlog

| Item | Type | Intake | Rationale |
|------|------|--------|-----------|
| #171 | enh | Funnel | Needs post-train real labels A/B |
| #172 | enh | Funnel | Optional baseline; P3 |
| #167 | enh | Ready | Granite encoder — unrelated theme |
| #162 | enh | Ready | better-sqlite3 major — hygiene theme |
| #163 | enh | Ready | toolchain majors — hygiene theme |
| #157 | enh | Ready | ESLint flat config — hygiene |
| #156 | chore | Funnel | STATUS hygiene |
| #151 | enh | Funnel | hardware probe unit tests |
| #96 | enh | Funnel | modernbert_k4 default — no flip this train |
| #95 | enh | Funnel | shadow dogfood soft-feed epic |
| #110 | enh | Funnel | parent epic; Partial via this train |
| #1 / #25 / #26 | epic | Parked | Hardware — physical access |

## Next-train slate (3–7 items)

| Issue | Candidate theme | Intake |
|-------|-----------------|--------|
| #171 | Post-train cyclomatic_threshold serve-time A/B | Funnel |
| #95 | Shadow quality/cost dogfood vs release gates | Funnel |
| #110 | Remainder of real P(success) after verifier train | Funnel |
| #167 | Opt-in Granite encoder dogfood | Ready |
| #162 | better-sqlite3 v13 hygiene | Ready |
| #163 | TypeScript / vitest toolchain majors | Ready |

Open-issue count must **not** raise this release’s enhancement or total-task caps.

---

## Risks and blockers

- SP-283/SP-284 need verifier-grade labels; if hard ECE gates fail, SP-284 keeps honest-untrained and documents (Partial #168).
- Wave 1 parallel SP-281 ∥ SP-285 — disjoint file scopes; watch scripts vs export paths.
- Quota-constrained worker pin (zai/glm-5.3) — monitor stalls; prefer detached batch.

---

## Publish checklist (Phase 5–6)

- [ ] All release-scoped tasks `.DONE` on `main`
- [ ] Post-integrate `release:check` green after **each wave**
- [ ] `spine preflight` green
- [ ] `npm run release:check` green on final `HEAD`
- [ ] `npm run release:assert-content` green vs `v1.0.0`
- [ ] Manifest target == expected next version from `package.json` + minor
- [ ] No existing git tag `v1.1.0`
- [ ] CI workflow green on `HEAD`
- [ ] `git status` clean
- [ ] Operator approved publish bump type: minor
- [ ] **Exactly one** `npm version minor` then `git push && git push --tags` — then **STOP**
- [ ] `release.yml` succeeded; `npm view` `latest` matches `1.1.0`
