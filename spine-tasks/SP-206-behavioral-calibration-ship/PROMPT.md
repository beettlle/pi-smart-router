# Task: SP-206 — Ship Behavioral P(success) + Isotonic From Dogfood Exports

**Created:** 2026-07-12
**Size:** M

## Review Level: 1

**Assessment:** Train and ship non-synthetic calibration artifacts from #95 dogfood exports; provenance + verify gates.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 1 (privacy), Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#110
- Bucket: feature
- Closes: #110 (when sample floors met and artifacts shipped)
- Depends on human exports: #95
- Release: v0.12.0
- Manifest: `spine-tasks/_authoring/release-v0.12.0/manifest.md`

## Mission

Closes #110 when floors are met — Aggregate privacy-safe dogfood exports from the #95 window (`routing:calibration-aggregate` and/or dataset export JSONL). Train with `npm run routing:train-p-success` and `npm run routing:train-calibration` (or documented equivalents). Ship checked-in `config/routing-calibration.json` **or** document why it remains operator-local. Replace or clearly supersede synthetic-only `config/p-success-weights.json` when ≥30 labeled economical-tier rows exist, with provenance noting **non-synthetic** sources. Keep soft ECE / dry-run packs enforced; **never invent labels**. If floors are not met, write a Partial artifact under `spine-tasks/_authoring/release-v0.12.0/` and leave #110 open — do not ship fake behavioral weights.

## Dependencies

- **Task:** SP-205 (behavioral-first docs must exist)
- **External:** Operator-archived #95 dataset and/or telemetry-contrib export path(s) with privacy check passed; prefer ≥30 labeled economical-tier rows (passive signals OK)

## Context to Read First

- `docs/qa/shadow-dogfood-protocol.md`
- README calibration section (post SP-205)
- `scripts/calibration-aggregate.ts`, `scripts/train-p-success-weights.ts`, `scripts/train-routing-calibration.ts`
- `config/routing-calibration.json.example`, existing `config/p-success-weights.json` provenance
- GitHub #110; #95 sign-off / export paths from operator

## Environment

- **Workspace:** `config/`, `scripts/`, `README.md`, `tests/`
- **Services required:** None (offline train from export files)
- **Input:** Export path provided by operator (STATUS Discoveries / Notes) — typically under `.pi-smart-router/` (gitignored); copy training JSONL into a worker-readable path if needed (e.g. `data/contrib/` or documented temp under repo that is gitignored)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/p-success-weights.json` **and/or** `config/routing-calibration.json` (create), `README.md` |
| May change | `scripts/**` (only if aggregate/train CLI needs a thin dogfood→train glue), `tests/unit/**` (provenance/verify tests), `spine-tasks/_authoring/release-v0.12.0/**` (Partial writeup if floors unmet), `package.json` (script alias only if needed) |
| Must NOT change | `config/release-gates.json`, `src/config/defaults.ts`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm run routing:verify-calibration -- --skip-embed` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/config/defaults.ts` |
| completionCriteria | Either (A) floors met: non-synthetic p-success and/or routing-calibration shipped with provenance + verify green + README updated + #110 closable; or (B) floors unmet: Partial writeup archived, no invented labels, #110 left open with clear blocker. |

## Steps

### Step 1: Locate exports + aggregate

- [ ] Read operator export path(s) from STATUS Notes / release manifest human checklist
- [ ] Privacy spot-check: no prompt/message bodies in training input
- [ ] Run `npm run routing:calibration-aggregate` (or documented dataset→JSONL path) into an aggregated train file
- [ ] Record sample counts (economical-tier labeled) in STATUS Discoveries

### Step 2: Train, ship or Partial

- [ ] If ≥30 labeled economical-tier rows (and other component floors as applicable): train p-success + calibration; write `config/p-success-weights.json` and/or `config/routing-calibration.json` with **non-synthetic** provenance
- [ ] If floors unmet: do **not** overwrite with synthetic-as-behavioral; write `spine-tasks/_authoring/release-v0.12.0/behavioral-calibration-partial.md` with counts + blocker; leave configs unchanged or document operator-local path
- [ ] Update README: behavioral path status (shipped vs operator-local vs deferred)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] If artifacts shipped: `npm run routing:verify-calibration` (full or documented skip-embed path) + `npm run routing:calibration-dry-run` soft path as documented
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage if application/scripts tests changed
- [ ] Close #110 only on path (A); comment Partial on (B)

## Documentation Requirements

**Must Update:**
- `README.md` — calibration section reflects shipped vs deferred behavioral artifacts

**Check If Affected:**
- `docs/qa/shadow-dogfood-protocol.md`
- `config/routing-calibration.json.example`

## Completion Criteria

- [ ] Aggregated from real dogfood exports (or Partial documented)
- [ ] Non-synthetic artifacts shipped when floors met; provenance honest
- [ ] Verify / soft ECE path still enforced; no invented labels
- [ ] #110 closed (A) or Partial with clear blocker (B)

## Git Commit Convention

- `feat(SP-206): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Invent outcome labels or claim synthetic fixture as behavioral
- Change absolute `config/release-gates.json` thresholds
- Flip encoder defaults (#96)
- Close #95 (human sign-off only)
- Start this task before operator confirms export paths (External dependency)

## Amendments

None.
