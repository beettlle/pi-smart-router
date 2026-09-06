# SP-266 — Harden shadow dogfood protocol and release-gate soft-feed wiring. — Status

**Current Step:** 1
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

**Status:** Not Started

- [ ] Harden docs/commands
- [ ] Wire soft-feed if code gaps exist

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green
- [ ] STATUS lists operator command sequence

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
