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
- Do **not** invent harness labels or force community Track B to pass until the dogfood→harness adapter lands.
- Do **not** flip encoder defaults (`granite` / `modernbert_k4`) from this protocol.

## Setup

1. Install / enable the smart-router pi extension from this repo.
2. In pi: `/model smart-router/auto`.
3. Scoped fleet should include:
   - at least one **economical-cloud** model
   - at least one **frontier-cloud** model
   - a **non-Gemini** fallback such as `cursor/auto` or `composer-latest` (avoids empty-fleet fail-safe on Gemini-only configs)
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
| 6 | Gemini-heavy (if in fleet) | Tool-heavy Gemini session | thought_signature / empty-fleet behavior |

## Per-session recording

After each session (or at natural breakpoints):

1. `/smart-router status`
2. `/smart-router history` (sample recent decisions: stage, reason, selected model)
3. Prefer **passive** outcome signals already captured when `SMART_ROUTER_DATASET=1` (model override, compaction pin break, loop escalation proxies).
4. Use `/smart-router feedback good|bad` only when the outcome is clearly successful or clearly failed — optional, not required for a valid run.
5. Note subjective over-routing (too expensive) or under-routing (quality miss) in the sign-off form.

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

Training floors used elsewhere in the project: **≥30** labeled economical-tier rows preferred before trusting isotonic / P(success) retrains. A shorter window (≥5 matrix sessions) is still valid for #95 qualitative sign-off.

## Offline companion commands

From the repo root (after sessions, or anytime):

```bash
npm run qa:shadow-dogfood
```

Or manually:

```bash
# Hard gates on default fixtures — MUST pass
npm run release:functional-smoke

# TwinRouterBench soft-feed — expect soft FAIL on over-routing; exit 0
npm run routing:assert-release-gates:corpus-report
```

Archive stdout / generated reports with the sign-off (the QA script copies under `.pi-smart-router/qa-runs/<timestamp>/`).

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
| Track B adapter (authoring draft) | Dogfood export → harness fixtures (autonomous) |
| Over-routing analysis (authoring draft) | Why corpus ≈0.85 (autonomous) |
| Behavioral calibration (authoring draft) | Train/ship non-synthetic weights from exports |
| [#75](https://github.com/beettlle/pi-smart-router/issues/75) (closed) | Original profile ingest/mapper — keep closed |
| [#108](https://github.com/beettlle/pi-smart-router/issues/108) | Dogfood fleet `benchmark` vs `pattern_default` coverage |
| [#96](https://github.com/beettlle/pi-smart-router/issues/96) | Encoder / K=4 enablement after holdout evidence |

**Coverage report:** which primary fleet IDs resolve `capability_source=benchmark` vs intentional `pattern_default` gaps — [`docs/capability-profile-coverage.md`](../capability-profile-coverage.md) (metric gated by `tests/unit/pi-model-mapper-coverage.test.ts`).

Paste-ready GitHub bodies: [`spine-tasks/_authoring/issues/`](../../spine-tasks/_authoring/issues/).
