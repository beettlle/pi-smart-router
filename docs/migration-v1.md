# Migrating to pi-smart-router 1.0

**Audience:** operators running the pi extension and library embedders upgrading from `0.22.x` (or any earlier `0.y.z`).
**Scope:** what the `1.0.0` release train changed, what you must do, and the SemVer stability policy that starts with it.

`1.0.0` is a **stability marker, not a routing-behavior rewrite**. The 12-stage pipeline, tiers, operator commands, environment variables, and telemetry store are unchanged from `0.22.x`. The release train that produced `1.0.0` shipped behavioral calibration artifacts, an internal pipeline architecture cleanup, and publish hygiene — none of which change routing policy for existing installs.

If you are skipping versions, also read the notes for the releases you jumped over (notably the **telemetry-contrib schema v2 session-hash migration** in `v0.21.0` — v1 and v2 export hashes are not comparable; re-baseline, do not mix rows across the version boundary).

---

## TL;DR upgrade checklist

| Who | Action | Why |
|-----|--------|-----|
| pi extension users | Upgrade your **pi host to ≥ 0.85.1** (`pi.minPiVersion`), then `pi install npm:pi-smart-router@1.0.0` (or update your path package) | pi host floor raised from `0.80.8` |
| pi extension users on `engine-strict` installs | Confirm **Node.js ≥ 22.19.0** | `engines.node >= 22.19.0`; installs below the floor fail with `EBADENGINE` |
| Library embedders | `npm install pi-smart-router@1.0.0` — no code changes expected | Public API is unchanged (see [SemVer stability surface](#semver-stability-surface)) |
| Anyone importing `scripts/src/**` compile artifacts | Stop — use `src/**` source or the public `dist/` exports | Committed `scripts/src` artifacts were removed ([#150](https://github.com/beettlle/pi-smart-router/issues/150)); CI fails closed on reintroduced drift |
| Operators with self-trained calibration files | Nothing — your `config/p-success-weights.json` / `config/routing-calibration.json` keep overriding the shipped defaults (file-based reload + restart) | Calibration is opt-in per file; shipped artifacts are defaults, not mandates |

No database migrations, no config-file format changes, no session-state changes.

---

## Raised requirements (breaking expectations)

| Requirement | `0.22.0` | `1.0.0` train | Notes |
|-------------|----------|---------------|-------|
| pi host (`pi.minPiVersion`) | `0.80.8` | **`0.85.1`** | Peer freshness ([#154](https://github.com/beettlle/pi-smart-router/issues/154)); the extension refuses to load on older hosts |
| `@earendil-works/pi-ai` (runtime dependency) | `^0.84.4` | **`^0.85.1`** | Resolved by `npm install` / `pi install`; no embedder action beyond the normal update |
| Node.js (`engines.node`) | `>=22.19.0` | `>=22.19.0` (unchanged) | The floor was already declared in `0.22.0`; the 1.0 train makes CI enforce it — `ci.yml`, `release.yml`, `calibration-verify.yml`, and `eval-harness-smoke.yml` pin `22.19.0`. With `engine-strict=true`, installs on Node `< 22.19.0` fail with `EBADENGINE` |
| Committed `scripts/src/**` artifacts | Present in git | **Removed** | Plus a CI guard that fails closed if compile artifacts drift back in ([#150](https://github.com/beettlle/pi-smart-router/issues/150)) |

> **Auxiliary CI follow-up:** three non-release workflows (`benchmark-profile-refresh.yml`, `twinrouterbench-full-nightly.yml`, `npm-deprecate.yml`) still resolve Node `'22'` (latest 22.x, which satisfies the floor in practice). They were out of the original packet's file scope; hard-pinning them is a tracked follow-up, not a migration requirement.

## Behavioral calibration artifacts (#110)

`1.0.0` is the first release whose checked-in calibration artifacts are trained on **real dogfood behavior** rather than synthetic fixtures. This resolves the long-standing "Partial (B)" posture of SP-206.

### What ships

| Artifact | Contents | Provenance |
|----------|----------|------------|
| `config/p-success-weights.json` | Logistic P(success) weights, `trained_sample_count: 32` | Operator's real **July 2026 dogfood aggregate** — privacy-safe feature vectors + outcome labels only, no prompt text |
| `config/routing-calibration.json` (bundle v2) | P(success) weights + **trained isotonic calibrator** + bootstrap routing centroids | Same aggregate; isotonic holdout ECE **0.0695 raw → 0.0208 calibrated** (fit 26 / holdout 6, 18 knots) |

The synthetic SP-175 fixture weights are **superseded**. The labeled-sample floor (≥30 economical-tier rows) was met with **32 labeled samples (27 good / 5 bad)**; 47 unlabeled rows were skipped, never coerced. Train/verify evidence: [`spine-tasks/_authoring/release-v1.0.0/calibration-train-note.md`](../spine-tasks/_authoring/release-v1.0.0/calibration-train-note.md).

### What did *not* train (honest floors)

Floors that were not met keep neutral defaults with `trained_sample_count: 0` — they are **not** dogfood-trained and are not advertised as such:

| Bundle component | Floor | Samples | Shipped state |
|------------------|-------|---------|---------------|
| `p_success_weights` / `isotonic_calibrator` | ≥30 | 32 | **Trained** (dogfood) |
| `triage_thresholds` | ≥50 | 0 | Neutral defaults |
| `hydra_projection` | ≥100 | 0 | Neutral defaults |
| `routing_centroids` | ≥10 (for OATS shift) | — | Bootstrap centroids (4 clusters, verify PASS) |

### Operator impact

- **Default installs:** nothing to do. The bundle loads automatically; `p_success_calibrated` / `p_success_cheap` on explain and telemetry are calibrated values (`p_success_raw` keeps the raw logistic score).
- **Below floors / missing bundle:** the pipeline degrades to the identity calibrator and neutral `P_success_cheap = 0.5` — routing never fails on calibration state.
- **Retrain with your own data:** see [Shadow dogfood → calibration behavioral path](#shadow-dogfood--calibration-behavioral-path) below, or the [zero-manual-label bootstrap](../README.md#psuccess-training-export-baseline-classifier) in the README. Never invent labels — exports without outcome signals stay unlabeled and are skipped.

## Pipeline architecture notes (#143 / #155)

The `1.0.0` train restructured the routing pipeline internals with **zero routing-behavior change**. This matters to you only if you read or imported the internals.

### What changed

| Change | Where | Before → after |
|--------|-------|----------------|
| Stage contract + shared context | `src/domain/pipeline/pipeline-stage.ts` | Stages implemented `PipelineStage` reading/writing a per-route `RoutingContext` instead of private orchestrator fields; one context per `route()` (calls are single-flight serialized, SP-230) |
| Stage extraction | `src/domain/pipeline/*-stage.ts` | The ~2103-line `router-pipeline.ts` god file became a ~810-line orchestrator plus 12 stage modules matching `PIPELINE_STAGE_ORDER` (`hardware_probe` → `loop_escalation` → `turn_envelope` → `context_fit` → `low_intensity` → `session_pin` → `triage` → `local_zero` → `triage_cloud_fallback` → `hydra_match` → `safe_default` → `context_overflow_fallback`) |
| Domain ports | `src/domain/ports/` | `HardwareProbePort`, `LocalRuntimePort`, `TelemetryEmitterPort` (+ `RoutingCostEstimator` seam) — **domain owns the contracts, infrastructure implements them**. The pure policy kernels (probe thresholds, ping orchestration, observability builders) moved into `src/domain/`; impure host adapters stay in `src/infrastructure/` |
| Telemetry split | `src/infrastructure/telemetry/` | The telemetry module split into `routing-telemetry.ts`, `pin-economics-telemetry.ts`, `planning-delegate-telemetry.ts`, `telemetry-scalar-fields.ts`, `telemetry-limits.ts` |
| Test fragmentation | `tests/unit/router-pipeline-*.test.ts` | The 2206-line monolith test was deleted and rebuilt per-stage |

### Import-path stability

Old import paths from the pre-split modules **continue to resolve** — the infrastructure modules re-export the port symbols, so existing deep imports do not break. That said, deep imports into `src/**` internals remain outside the stability surface (see below); prefer the public exports.

## Shadow dogfood → calibration behavioral path

The shadow dogfood protocol and the behavioral calibration pipeline are two ends of one loop: dogfood sessions produce privacy-safe outcome-labeled rows; those rows train the calibration artifacts that ship back into routing. `1.0.0` closes the loop with real data.

```text
SMART_ROUTER_DATASET=1 dogfood sessions (/model smart-router/auto)
        │  passive outcomes only — /feedback optional
        ▼
/smart-router export dataset · /smart-router export telemetry-contrib   (privacy-safe; no prompt text)
        ▼
npm run routing:calibration-aggregate -- --contrib-dir data/contrib     (rejects tainted payloads)
        ▼
npm run routing:train-p-success / routing:train-calibration             (≥30 labeled floor)
        ▼
npm run routing:verify-calibration                                      (15/15 gates)
        ▼
config/*.json artifacts → reload + restart → routed decisions carry calibrated P(success)
```

- **Protocol (human QA):** [`docs/qa/shadow-dogfood-protocol.md`](qa/shadow-dogfood-protocol.md) — session matrix, prerequisites, and the [#95](https://github.com/beettlle/pi-smart-router/issues/95) dual-gate decision procedure. Companion scripts: `npm run qa:shadow-dogfood` and `npm run qa:dogfood-soft-feed`.
- **Behavioral labels:** derived passively from outcome signals (`model_override`, `feedback_bad`, `tool_failure_chain`, `stop_reason_invalid`, …) via `deriveSuccessLabelFromExportRow` — no manual annotation required, and none invented.
- **1.0.0 evidence posture:** the [#95 evidence artifact](../spine-tasks/_authoring/release-v1.0.0/shadow-dogfood-evidence.md) records that the *human* dogfood floor was **not** met at release time (0 human sessions), so frugality defaults are **kept** and absolute release gates are unchanged. The calibration bundle's 32 labeled rows come from the operator's own July 2026 aggregate — a separate, disclosed provenance.

## SemVer stability surface

Starting with `1.0.0`, pi-smart-router follows [semantic versioning](https://semver.org). Breaking changes arrive only in a new major version, accompanied by a migration guide like this one.

### Stable from 1.0

| Surface | Examples |
|---------|----------|
| npm public exports (`src/index.ts`) | `createRouter`, `createRouterFromFleet`, `createPiRouterMiddleware`, `LifecycleHookState`, `RoutingDecision` / `ModelProfile` / `RouterHandle` types |
| Operator commands | `/smart-router status · history · stats · mode · pricing · export · feedback · unpin · plan · doctor` |
| Documented environment variables | Everything in the README [environment variables table](../README.md#environment-variables) |
| Routing decision / telemetry field vocabulary | `stage`, `reason_code`, `route_path`, explain payload fields — additive fields may appear; existing fields do not rename or disappear within a major |
| Config file shapes | `models.yaml`, `routing-clusters.yaml`, `routing-centroids.json`, `routing-calibration.json`, `p-success-weights.json`, `operator-config.json` (additive keys only) |
| Tier vocabulary | `zero-tier`, `economical-cloud`, `frontier-cloud` |

### Not covered by the stability promise

- **Deep imports into `src/**` internals** beyond the public exports — including the extension's own modules under `.pi/extensions/smart-router/` (the extension-vs-library facade gap is [#149](https://github.com/beettlle/pi-smart-router/issues/149); until it lands, treat internals as unstable).
- Repo tooling: `scripts/**`, `.spine/**`, `spine-tasks/**`, CI workflow definitions.
- `config/release-gates.json` absolute thresholds — operator-tunable quality gates, changed only through the documented out-of-band review process, not SemVer.

## What 1.0 does *not* change

To keep expectations matched to shipped behavior:

- **Encoder defaults are unchanged.** MiniLM remains the default encoder; `granite` stays opt-in trial; `modernbert_k4` stays **off** by default — [#96](https://github.com/beettlle/pi-smart-router/issues/96) go/no-go evidence ([SP-204 artifact](../spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md), [SP-219 A/B](../spine-tasks/_authoring/release-v0.16.0/modernbert-k4-top1-artifact.md)) recommends keeping the default until trained heads exist. The gate is **not measurable as flipped**, and this guide does not claim it.
- **Frugality defaults are kept** — the #95 human dogfood floor was unmet at release; no relaxation shipped.
- **The extension vs library capability gap** (stream failover loop, planning delegate spawn, headroom escalation, quota reaction) remains extension-only pending [#149](https://github.com/beettlle/pi-smart-router/issues/149).
- **Toolchain majors are deferred** — `better-sqlite3` v13 ([#162](https://github.com/beettlle/pi-smart-router/issues/162)), TS7/vitest4 ([#163](https://github.com/beettlle/pi-smart-router/issues/163)), ESLint flat config ([#157](https://github.com/beettlle/pi-smart-router/issues/157)) stay on current ranges.
- **Absolute release gates are unchanged** — nothing in the 1.0 train edits `config/release-gates.json`.

## Release train reference

The `1.0.0` train (theme: *1.0 readiness — behavioral calibration quality, maintainable stage/port pipeline architecture, publish/engine honesty, SemVer-stable operator docs*) comprised SP-263 through SP-279. Composition, dependency freshness, and the publish checklist live in the [release manifest](../spine-tasks/_authoring/release-v1.0.0/manifest.md). The exact published version always mirrors `package.json` — see [npm](https://www.npmjs.com/package/pi-smart-router).

---

*Found a gap in this guide? [Open an issue](https://github.com/beettlle/pi-smart-router/issues/new) — migration docs are part of the stability promise.*
