# SP-266 — Harden shadow dogfood protocol and release-gate soft-feed wiring. — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Read existing protocol + release-gates
- [x] Identify soft-feed gaps

Findings: (1) `scripts/eval/dogfood-track-b-adapter.ts` is library-only — no CLI/npm script wires a dogfood Track B export into release gates, so operators cannot attach dogfood exports to gates without hand-writing fixtures. (2) Protocol doc lacks exact soft-feed dry-run commands and explicit pass/fail criteria for frugality-relaxation evidence. (3) `assert-release-gates.ts` already supports `--report-only` + `--config` override — reuse, do not edit `config/release-gates.json`.

## Step 1: Protocol + soft-feed

**Status:** Complete

- [x] Harden docs/commands
- [x] Wire soft-feed if code gaps exist

Delivered: new CLI `scripts/qa/dogfood-soft-feed.ts` + npm script `qa:dogfood-soft-feed` (dogfood Track B export → harness fixtures → absolute gates, report-only, always exit 0 on PASS/soft-FAIL/SKIP; exit 1 only on operator error). Protocol doc gained "Attach dogfood exports to release gates (soft-feed dry-run)" section with exact commands, skip semantics, and a pass/fail table for frugality-relaxation evidence; sign-off form extended. README cross-links added. `config/release-gates.json` untouched; frugality defaults untouched.

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green
- [ ] STATUS lists operator command sequence

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-06 | 0 | plan | skipped (engine-run post-.DONE, SP-195) |
| 2026-09-06 | 1 | plan | skipped (engine-run post-.DONE, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | Track B adapter was library-only — no operator path to attach dogfood exports to gates | Added qa:dogfood-soft-feed CLI wiring export → fixtures → report-only gates |
| 2026-09-06 | Baseline regression vs fixture baselines is not meaningful for dogfood corpora | Soft-feed defaults to absolute gates; --baseline-version opt-in |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
