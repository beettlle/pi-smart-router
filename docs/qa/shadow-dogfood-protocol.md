# Shadow dogfood protocol (human QA)

Operator checklist for live pi sessions that prove quality-first routing under real workloads. Supports GitHub [#95](https://github.com/beettlle/pi-smart-router/issues/95) (shadow dogfood + public-track soft-feed) and feeds calibration / profile coverage follow-ons.

Companion script: `npm run qa:shadow-dogfood` ([`scripts/qa/shadow-dogfood-session.sh`](../../scripts/qa/shadow-dogfood-session.sh)).

## Goal

- Exercise `/model smart-router/auto` across a fixed session matrix.
- Capture privacy-safe dataset / telemetry exports for calibration.
- Archive offline gate reports (hard fixtures + TwinRouterBench soft-feed).
- Record a go/no-go sign-off for #95 without relaxing release gates.

## Non-goals

- Do **not** edit [`config/release-gates.json`](../../config/release-gates.json) without explicit operator approval.
- Do **not** treat TwinRouterBench soft FAIL (`mean_over_routing_rate` ≈ 0.85 vs max 0.15) as a release blocker — it is intentional soft signal for #95.
- Do **not** invent harness labels. Community Track B (`--dogfood-export`) runs only when the export includes required outcome labels (`success_label`, `min_tier`, `min_model_id`); incomplete exports skip with an explicit reason (see `scripts/eval/dogfood-track-b-adapter.ts` / [#111](https://github.com/beettlle/pi-smart-router/issues/111)).
- Do **not** flip encoder defaults (`granite` / `modernbert_k4`) from this protocol.

## Prerequisites (any machine)

- Clone of this repo; from the package root run `npm install`.
- `bash`, Node.js, and `npm` on `PATH`.
- pi with the smart-router extension enabled from this checkout.
- Live matrix is install-local (your scoped fleet + credentials). Offline companion (`npm run qa:shadow-dogfood`) is repo-local: the script resolves the package root from its own path and does not depend on the invoke cwd.

## Setup

1. Install / enable the smart-router pi extension from this repo.
2. In pi: `/model smart-router/auto`.
3. Scoped fleet should include (provider-agnostic — use whatever your install exposes):
   - at least one **economical-cloud** model
   - at least one **frontier-cloud** model
   - at least one **non-Google** fallback (avoids empty-fleet fail-safe on Gemini-only configs). Examples by class: Anthropic Sonnet/Opus, OpenAI or Copilot coding models, or any other non-Google id available in that install.
4. Environment (shell that launches pi, or documented install env):

   ```bash
   export SMART_ROUTER_DATASET=1
   # optional, for stderr decision traces during dogfood:
   export SMART_ROUTER_LOG_ROUTING=1
   ```

5. Confirm capture is live: after one turn, `/smart-router status` should show dataset capture enabled (or equivalent status fields in your build).

## Session matrix (minimum)

Run **at least five** sessions covering every row below (one session may cover multiple rows if clearly noted).

| # | Scenario | What to do | What to watch |
|---|----------|------------|---------------|
| 1 | Trivial chat | Short Q&A, no tools | Prefer economical / local; note over-routing |
| 2 | Code edit + tool loop | Multi-step edit with tools | Pin continuity; loop escalation if stuck |
| 3 | Planning turn | Ask for a multi-file plan / architecture | Planning delegate vs pin smash; frontier sub-call |
| 4 | Multi-turn pin continuity | Same session, 5+ turns on one task | Pin preserved; unjustified pin breaks |
| 5 | Hard task | Intentionally difficult coding task | Under-routing to weak models; quality failures |
| 6 | Gemini-heavy (optional) | Only if Gemini is in your fleet: tool-heavy Gemini session | thought_signature / empty-fleet behavior; N/A when unused |

## Per-session recording

After each session (or at natural breakpoints):

1. `/smart-router status`
2. `/smart-router history` (sample recent decisions: stage, reason, selected model)
3. `/smart-router stats` (window aggregates + role cost breakdown before/during export; privacy-safe, no prompt bodies)
4. Prefer **passive** outcome signals already captured when `SMART_ROUTER_DATASET=1` (model override, compaction pin break, loop-escalation proxies, `stop_reason` / related failure proxies). These are sufficient for the zero-manual-label calibration bootstrap ([#110](https://github.com/beettlle/pi-smart-router/issues/110)) — no invented labels.
5. Use `/smart-router feedback good|bad` only when the outcome is clearly successful or clearly failed — optional, not required for a valid run or for P(success) training.
6. Note subjective over-routing (too expensive) or under-routing (quality miss) in the sign-off form.

## Export and privacy check

From pi (after the dogfood window):

```text
/smart-router export dataset [--limit N]
/smart-router export telemetry-contrib
```

Then:

1. Open the export files and confirm **no prompt text**, messages, or tool argument bodies.
2. Record: export paths, row counts, date, install / fleet notes.
3. Store exports outside git (default under `.pi-smart-router/`; already gitignored).

Training floors used elsewhere in the project: **≥30** labeled economical-tier rows preferred before trusting isotonic / P(success) retrains (`minimum_training_samples.p_success_weights` / `isotonic_calibrator`). A shorter window (≥5 matrix sessions) is still valid for #95 qualitative sign-off. Incomplete Track B / harness exports must **skip** rather than invent labels ([#111](https://github.com/beettlle/pi-smart-router/issues/111)).

### Next step after export — behavioral calibration ([#110](https://github.com/beettlle/pi-smart-router/issues/110))

Shadow dogfood exports are the human half of behavioral calibration. After privacy checks:

```bash
# Aggregate community / local contrib (rejects tainted prompt/message keys)
npm run routing:calibration-aggregate -- --contrib-dir data/contrib

# Train when ≥30 economical-tier labeled rows exist (passive signals OK — no /feedback required)
npm run routing:train-p-success -- --input path/to/export.jsonl --output config/p-success-weights.json
npm run routing:train-calibration -- --input path/to/aggregated.jsonl

# Verify shapes and benchmark gates
npm run routing:verify-calibration -- config/routing-calibration.json
```

Checked-in `config/p-success-weights.json` remains **synthetic/fixture** until the train/ship slice (SP-206) replaces it with non-synthetic provenance. Docs for the zero-manual-label path live in the README [behavioral-first bootstrap](../../README.md#behavioral-first-bootstrap-zero-manual-labels) section.

## Offline companion commands

After sessions, or anytime — from this package (cwd optional; `npm run` / the script bind to the package root):

```bash
npm run qa:shadow-dogfood
```

Or manually from the package root:

```bash
# Hard gates on default fixtures — MUST pass
npm run release:functional-smoke

# TwinRouterBench soft-feed — expect soft FAIL on over-routing; exit 0
npm run routing:assert-release-gates:corpus-report
```

Archive stdout / generated reports with the sign-off (the QA script copies under `<package-root>/.pi-smart-router/qa-runs/<timestamp>/`, overridable via `SMART_ROUTER_QA_OUT_DIR`).

## Sign-off form

Copy into the #95 comment or your QA tracker:

```text
Shadow dogfood sign-off
Date:
Operator:
Repo commit / version:
Fleet models enabled:

Sessions completed (matrix rows 1–6):
  [ ] 1 trivial  [ ] 2 tool loop  [ ] 3 planning  [ ] 4 pin continuity
  [ ] 5 hard task  [ ] 6 Gemini-heavy (N/A if unused)

SMART_ROUTER_DATASET=1: yes / no
Dataset export path + row count:
Telemetry-contrib path + row count:
Privacy check (no prompts): pass / fail

Offline:
  release:functional-smoke: pass / fail
  corpus soft-report archived: yes / no
  observed mean_over_routing_rate (if printed):

Subjective notes:
  Over-routing:
  Under-routing:
  Pin breaks:
  Planning delegate:

#95 go/no-go (quality-first under dogfood): go / no-go / needs more data
Recommend changing absolute release gates: no / yes (requires separate approval)
Recommend relaxing frugality / flipping encoder defaults: no / yes (requires #96 / calibration issues)
```

## Related issues

| Issue | Role |
|-------|------|
| [#95](https://github.com/beettlle/pi-smart-router/issues/95) | Shadow dogfood + public-track soft-feed protocol |
| [#110](https://github.com/beettlle/pi-smart-router/issues/110) | Behavioral calibration — zero-manual-label bootstrap → aggregate → train → verify (docs SP-205; train/ship SP-206) |
| [#111](https://github.com/beettlle/pi-smart-router/issues/111) | Track B dogfood export → harness adapter (labeled exports only; never invent labels) |
| Over-routing analysis (authoring draft) | Why corpus ≈0.85 (autonomous) |
| [#75](https://github.com/beettlle/pi-smart-router/issues/75) (closed) | Original profile ingest/mapper — keep closed |
| [#108](https://github.com/beettlle/pi-smart-router/issues/108) | Mapper coverage metric over a fixed fixture ID list (`benchmark` vs `pattern_default`) |
| [#96](https://github.com/beettlle/pi-smart-router/issues/96) | Encoder / K=4 enablement after holdout evidence |

**Coverage report (not the live #95 fleet):** [`docs/capability-profile-coverage.md`](../capability-profile-coverage.md) measures mapper coverage for a **fixed fixture ID list** in this repo (gated by `tests/unit/pi-model-mapper-coverage.test.ts`). Live shadow dogfood uses **any** scoped fleet that meets Setup §3 — that fixture list is not required for #95 sign-off.

Paste-ready GitHub bodies: [`spine-tasks/_authoring/issues/`](../../spine-tasks/_authoring/issues/).
