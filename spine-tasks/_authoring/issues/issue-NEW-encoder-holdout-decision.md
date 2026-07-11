# NEW ISSUE — Encoder holdout decision run (autonomous)

**Suggested title:** Run pack holdout ECE + encoder latency; produce #96 go/no-go artifact

**Suggested labels:** evaluation, routing

**Action:** Create a new GitHub issue. Executes measurements that advance or close #96. #96 remains the product decision tracker.

---

## Problem

#96 enablement is blocked on evidence, not missing modules. Someone needs to run the existing measurement scripts, compare MiniLM vs Granite (and K=4 if configured), and write a decision artifact operators can approve.

## Acceptance criteria

- [ ] Run `npm run routing:calibration-dry-run` (or pack holdout ECE path documented in README) and archive results for current defaults.
- [ ] Run `npm run benchmark:encoder` for candidate encoder configs; record p50/p95 vs budget.
- [ ] If K=4 heads artifacts/config are available, measure Top-1 / ECE impact vs learned_projection; otherwise document blocker.
- [ ] Produce decision writeup with clear recommendation:
  - keep minilm defaults, or
  - promote granite, and/or
  - enable modernbert_k4
- [ ] Link writeup from #96; do **not** flip `src/config/defaults.ts` in this issue unless #96 AC + operator approve are already satisfied.
- [ ] Note any missing ONNX weights / config files that block measurement.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Measurement + writeup | Autonomous |
| Default flip approve | Human via #96 |

## Commands / files

- `npm run benchmark:encoder`
- `npm run routing:calibration-dry-run`
- `npm run routing:verify-calibration`
- `src/config/defaults.ts` (read-only unless approved flip)
- Label packs / ingest scripts already in repo

## Out of scope

- Implementing Granite/ModernBERT from scratch (#80/#81)
- Shadow dogfood human sessions
- Absolute release-gate edits

## Links

- Parent decision tracker: #96
- Update draft: `spine-tasks/_authoring/issues/issue-96-update.md`
