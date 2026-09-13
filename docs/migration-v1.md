# Migrating to pi-smart-router 1.0

**Audience:** operators running the pi extension and library embedders upgrading from `0.22.x` (or any earlier `0.y.z`).
**Scope:** what the `1.0.0` release train changed, what you must do, and the SemVer stability policy that starts with it.

`1.0.0` is a **stability marker, not a routing-behavior rewrite**. The 12-stage pipeline, tiers, operator commands, environment variables, and telemetry store are unchanged from `0.22.x`. The release train that produced `1.0.0` shipped **honest calibration defaults** (floors unmet → neutral), an internal pipeline architecture cleanup, publish hygiene, and hard ECE gates that reject Sept-class isotonic collapse — none of which claim proven cheap-tier behavioral routing.

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
| pi host (`pi.minPiVersion`) | `0.80.8` | **`0.85.1`** | Peer freshness ([#154](https://github.com/beettlle/pi-smart-router/issues/154)); `0.85.1` is the declared extension floor |
| `@earendil-works/pi-ai` (runtime dependency) | `^0.84.4` | **`^0.85.1`** | Resolved by `npm install` / `pi install`; no embedder action beyond the normal update |
| Node.js (`engines.node`) | `>=22.19.0` | `>=22.19.0` (unchanged) | The floor was already declared in `0.22.0`; the 1.0 train makes CI enforce it — `ci.yml`, `release.yml`, `calibration-verify.yml`, and `eval-harness-smoke.yml` pin `22.19.0`. With `engine-strict=true`, installs on Node `< 22.19.0` fail with `EBADENGINE` |
| Committed `scripts/src/**` artifacts | Present in git | **Removed** | Plus a CI guard that fails closed if compile artifacts drift back in ([#150](https://github.com/beettlle/pi-smart-router/issues/150)) |

> **Auxiliary CI follow-up:** three non-release workflows (`benchmark-profile-refresh.yml`, `twinrouterbench-full-nightly.yml`, `npm-deprecate.yml`) still resolve Node `'22'` (latest 22.x, which satisfies the floor in practice). They were out of the original packet's file scope; hard-pinning them is a tracked follow-up, not a migration requirement.

## Behavioral calibration artifacts (#110 / #168)

`1.0.0` shipped **honest-untrained** calibration defaults. **`v1.1.0` ships verifier-graded trained P(success) + isotonic** after hard gates PASSED on a real `human_feedback` + live `llm_judge` corpus (2026-09-12). Scripted Sept dogfood gather remains quarantined (`scripted_intent`) and is never used for ship trains.

### What ships (v1.1.0)

| Artifact | Contents | Provenance |
|----------|----------|------------|
| `config/p-success-weights.json` | Logistic P(success) weights, `trained_sample_count: 243` | `verifier_grade_train_2026-09-12` — expected-cost tier hints active at serve time |
| `config/routing-calibration.json` (bundle v2) | Trained P(success) + isotonic + triage threshold **5** (57 samples, serve-active) + bootstrap centroids | Same provenance; HyDRA still `0/<100` (honest-untrained projection) |

Hard train gates (ship claims): `holdout_ece_calibrated ≤ holdout_ece_raw`, absolute calibrated ECE ≤ **0.10**, `y_knots` span ≥ **0.05**. Soft dry-run advisory ECE 0.25 remains separate.

### Floors (v1.1.0 ship)

| Bundle component | Floor | Samples | Shipped state |
|------------------|-------|---------|---------------|
| `p_success_weights` / `isotonic_calibrator` | ≥30 | **243** | **Trained** (ECE cal 0.0645 ≤ raw 0.1142; absolute ≤ 0.10) |
| `triage_thresholds` | ≥50 | **57** | Trained threshold **5**; serve-time loader reads it (#171) |
| `hydra_projection` | ≥100 | **0** | Neutral defaults (embeddings still opt-in / under floor) |
| `routing_centroids` | ≥10 (for OATS shift) | — | Bootstrap centroids (verify PASS) |

### Post-1.0 verifier-grade ship (v1.1.0) — hard gates PASSED

Timeline:

1. **2026-09-11** — CI-scale / early corpora failed absolute ECE or improve-gate; ship correctly refused. Historical notes: [`hard-gate-ship-note.md`](../spine-tasks/_authoring/release-v1.1.0/hard-gate-ship-note.md), [`hard-gate-retrain-2026-09-11.md`](../spine-tasks/_authoring/release-v1.1.0/hard-gate-retrain-2026-09-11.md).
2. **2026-09-12** — Live SP-282 packs (96 `llm_judge` rows, incl. 10 panel-adjudicated) + 147 `human_feedback` contrib rows → pool 243. Hash-split isotonic ECE **PASS** (cal 0.0645). Promoted into `config/*`. Record: [`hard-gate-pass-2026-09-12.md`](../spine-tasks/_authoring/release-v1.1.0/hard-gate-pass-2026-09-12.md).
3. **Session-holdout ECE (code path, not shipped)** — Preferring campaign `session_holdout` for ECE yields cal **0.1005 > 0.10** (FAIL by ~5e-4). Shipped artifacts stay on the Sep 12 hash-split PASS. See [`session-holdout-retrain-2026-09-12.md`](../spine-tasks/_authoring/release-v1.1.0/session-holdout-retrain-2026-09-12.md). Future trains will use session holdout when pack signals exist; promote only on exit 0.

**Known limits (honest):** HyDRA projection still untrained; panel adjudication may regenerate responses when no `--generations-in` sidecar exists; session-holdout ECE is implemented but not yet ship-cleared.

### TwinRouterBench corpus soft-fail

`npm run routing:assert-release-gates:corpus-report` reports `mean_over_routing_rate ≈ 0.87` vs absolute max 0.15 (**report-only**, exit 0). Root cause: harness `downgrade_first_candidate` on missing baselines for `zero-tier` labels — **not** live pipeline over-routing ([#112](https://github.com/beettlle/pi-smart-router/issues/112), [`over-routing-analysis.md`](../spine-tasks/_authoring/release-v0.11.0/over-routing-analysis.md)). Absolute `release:functional-smoke` stays on `tests/eval/fixtures`. Frugality defaults remain; [#95](https://github.com/beettlle/pi-smart-router/issues/95) stays open.

### Operator impact

- **Default installs (v1.1+):** trained P(success) + isotonic change low-intensity expected-cost tier hints vs 1.0.0 neutral `P=0.5`.
- **Below floors / missing bundle:** the pipeline still falls back to identity calibrator and neutral `P_success_cheap = 0.5` — routing never fails on calibration state.
- **Retrain with your own data:** see [Shadow dogfood → calibration behavioral path](#shadow-dogfood--calibration-behavioral-path) below. Never invent labels; never feed `dogfood-gather.sh` scripted_intent into ship trains.

## Pipeline architecture notes (#143 / #155)

The `1.0.0` train restructured the routing pipeline internals with **zero routing-behavior change**. This matters to you only if you read or imported the internals.

### What changed

| Change | Where | Before → after |
|--------|-------|----------------|
| Stage contract + shared context | `src/domain/pipeline/pipeline-stage.ts` | Stages implement `PipelineStage` against a per-route `RoutingContext` as the **sole** cross-stage state (dual-state `current*` sync removed); one context per `route()` (single-flight serialized, SP-230) |
| Stage extraction | `src/domain/pipeline/*-stage.ts` | The ~2103-line `router-pipeline.ts` god file became a ~810-line orchestrator plus ten extracted stage modules (the remaining stages — `loop_escalation`, `triage_cloud_fallback` — still run in the orchestrator); stage order is defined by `PIPELINE_STAGE_ORDER` (`hardware_probe` → `loop_escalation` → `turn_envelope` → `context_fit` → `low_intensity` → `session_pin` → `triage` → `local_zero` → `triage_cloud_fallback` → `hydra_match` → `safe_default` → `context_overflow_fallback`) |
| Domain ports | `src/domain/ports/` | `HardwareProbePort`, `LocalRuntimePort`, `TelemetryEmitterPort` (+ `RoutingCostEstimator` seam) — **domain owns the contracts, infrastructure implements them**. The pure policy kernels (probe thresholds, ping orchestration, observability builders) moved into `src/domain/`; impure host adapters stay in `src/infrastructure/` |
| Telemetry split | `src/infrastructure/telemetry/` | The telemetry module split into `routing-telemetry.ts`, `pin-economics-telemetry.ts`, `planning-delegate-telemetry.ts`, `telemetry-scalar-fields.ts`, `telemetry-limits.ts` |
| Test fragmentation | `tests/unit/router-pipeline-*.test.ts` | The 2206-line monolith test was deleted and rebuilt per-stage |

### Import-path stability

Old import paths from the pre-split modules **continue to resolve** — the infrastructure modules re-export the port symbols, so existing deep imports do not break. That said, deep imports into `src/**` internals remain outside the stability surface (see below); prefer the public exports.

### Composition roots: library `createRouter` vs pi extension

Two composition roots wire the same pipeline. They are **not** equivalent defaults:

| Root | Entry | What `GatewayDispatch` / `RouterPipeline` get by default |
|------|-------|----------------------------------------------------------|
| **Pi extension (supported product path)** | `.pi/extensions/smart-router/` → `createDispatchOptions()` in `fleet-bootstrap.ts` | Full operator wiring: `hardwareConfig` + `systemInfoProvider` (hardware probe), `telemetryEmitter` (store-backed), HyDRA matcher when available, session pinner, rate limiter, SAAR / loop-escalation / planning-delegate config |
| **npm library (catalog / embedder path)** | `createRouter()` → `createRouterFromCatalog()` → `createRouterFromFleet()` → `new GatewayDispatch(...)` | Catalog fleet load only. Constructor defaults today: **`costEstimator`** + **`localRuntime`**. Hardware probe stays **disabled** and telemetry is **opt-in** unless you pass `GatewayDispatchOptions` / `PipelineOptions` yourself |

**Operator guidance**

- Prefer the **pi extension** for production routing inside pi (`pi install` / project-local extension). That is the supported composition root for hardware readiness, telemetry persistence, and the stream/delegation product surface.
- Treat bare `createRouter()` / `createRouterFromFleet()` as a **catalog + routing-core** API for tests, custom hosts, and embedders who supply their own ports. Passing only a fleet path does **not** silently enable hardware probe or store telemetry.
- To get extension-like probe/telemetry on the library path, pass the ports explicitly on `createRouterFromFleet(fleet, options)` (same option bag as `GatewayDispatchOptions`), or keep using the extension.

This is intentional documentation of the composition split from the #143 ports inversion — not a silent capability loss on the extension path.

## Long-context encoder cascade (v1.2.0, #173)

The `v1.2.0` train ships an **opt-in, per-prompt encoder cascade** behind `hydra.encoder_cascade` ([#173](https://github.com/beettlle/pi-smart-router/issues/173), SP-291–SP-293). **Nothing changes unless you enable it** — `hydra.encoder` stays `minilm`, `encoder_cascade.enabled` defaults to `false`, and the cascade-disabled wire path is unchanged.

### Composition notes

| Piece | Behavior |
|-------|----------|
| Gate (`selectEncoderForPrompt`) | Pure pre-embedding arithmetic; reuses the turn-envelope token estimator (`estimated_input_tokens ?? prompt_text.length`). Reason codes: `cascade_disabled`, `under_threshold`, `over_threshold`, `granite_fallback` |
| Cascading embedder | Lazily owns two ONNX sessions — the Granite session loads only on the first over-threshold prompt; `dispose()` closes both. Wired only when `encoder_cascade.enabled` |
| Per-encoder artifacts | Encoders embed into different vector spaces — the cascade **never mixes** centroids or learned projection across encoders. Granite centroids come from `npm run routing:bootstrap-centroids -- --encoder granite` (namespaced `config/routing-centroids.granite.json`); the Granite-side projection ships **honest-untrained** (`trained_sample_count: 0`) and `npm run routing:verify-calibration` rejects cross-encoder bundles (fail closed) |
| Failure posture | Granite unavailable at request time → serve with MiniLM + `granite_fallback` telemetry. Continuity of routing wins; a crash or silent cross-space comparison is a bug |

### Config notes

`encoder_cascade` is an **additive key** on the existing `hydra` operator config (within the SemVer config-shape promise — additive keys only):

```json
{
  "hydra": {
    "encoder": "minilm",
    "encoder_cascade": {
      "enabled": false,
      "long_context_encoder": "granite",
      "token_threshold": 512
    }
  }
}
```

| Field | Default | Meaning |
|-------|---------|---------|
| `enabled` | `false` | Master switch; when off, every prompt uses the primary `hydra.encoder` |
| `long_context_encoder` | `"granite"` | Encoder selected at/over the threshold |
| `token_threshold` | `512` | Estimated-token boundary; matches MiniLM's context window |

Cascade-enabled decisions add four optional fields to the routing feature sidecar — `encoder_selected`, `token_estimate`, `cascade_threshold`, `cascade_fallback_reason` — additive telemetry, absent when the cascade is disabled. These fields exist to make the #173 eval table measurable on future dogfood evidence; **no default flip ships in v1.2.0**. Evidence: [`docs/qa/encoder-cascade-replay-v1.2.0.md`](qa/encoder-cascade-replay-v1.2.0.md). Operator runbook for the process-wide Granite switch (separate from the cascade) remains in the [README](../README.md) (#167).

## Shadow dogfood → calibration behavioral path

The shadow dogfood protocol and the behavioral calibration pipeline are two ends of one loop: dogfood sessions produce privacy-safe outcome-labeled rows; those rows can train calibration artifacts that ship back into routing. `1.0.0` shipped the **pipeline, hard ECE gates, and honest-untrained defaults**. `v1.1.0` ships **verifier-graded trained P(success) + isotonic** ([#168](https://github.com/beettlle/pi-smart-router/issues/168)); HyDRA + further dogfood remain on [#110](https://github.com/beettlle/pi-smart-router/issues/110) / [#95](https://github.com/beettlle/pi-smart-router/issues/95).

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
npm run routing:verify-calibration                                      (shapes + hard ECE when trained)
        ▼
config/*.json artifacts → reload + restart → routed decisions carry calibrated P(success)
```

- **Protocol (human QA):** [`docs/qa/shadow-dogfood-protocol.md`](qa/shadow-dogfood-protocol.md) — session matrix, prerequisites, and the [#95](https://github.com/beettlle/pi-smart-router/issues/95) dual-gate decision procedure. Companion scripts: `npm run qa:shadow-dogfood` and `npm run qa:dogfood-soft-feed`.
- **Behavioral labels:** derived passively from outcome signals (`model_override`, `feedback_bad`, `tool_failure_chain`, `stop_reason_invalid`, …) via `deriveSuccessLabelFromExportRow` — no manual annotation required, and none invented. Neutral signals (`compaction_pin_break`) stay unlabeled.
- **1.0.0 evidence posture:** the [#95 evidence artifact](../spine-tasks/_authoring/release-v1.0.0/shadow-dogfood-evidence.md) records that the *human* dogfood floor was **not** met at release time (0 human sessions), so frugality defaults are **kept** and absolute release gates are unchanged. Shipped calibration is **honest-untrained** pending verifier-graded post-1.0 retrain; TwinRouterBench corpus soft-fail is disclosed as a harness artifact ([#112](https://github.com/beettlle/pi-smart-router/issues/112)).

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

- **Encoder defaults are unchanged** — through `v1.2.0` inclusive. MiniLM remains the default encoder; `granite` stays opt-in trial; the v1.2.0 per-prompt **encoder cascade** ([#173](https://github.com/beettlle/pi-smart-router/issues/173)) ships **default off** (see [Long-context encoder cascade](#long-context-encoder-cascade-v120-173)); `modernbert_k4` stays **off** by default — [#96](https://github.com/beettlle/pi-smart-router/issues/96) go/no-go evidence ([SP-204 artifact](../spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md), [SP-219 A/B](../spine-tasks/_authoring/release-v0.16.0/modernbert-k4-top1-artifact.md)) recommends keeping the default until trained heads exist. The gate is **not measurable as flipped**, and this guide does not claim it.
- **Frugality defaults are kept** — the #95 human dogfood floor was unmet at release; no relaxation shipped.
- **The extension vs library capability gap** (stream failover loop, planning delegate spawn, headroom escalation, quota reaction, **and default hardware/telemetry wiring**) remains extension-only pending [#149](https://github.com/beettlle/pi-smart-router/issues/149). See [Composition roots](#composition-roots-library-createrouter-vs-pi-extension).
- **Toolchain majors are deferred** — `better-sqlite3` v13 ([#162](https://github.com/beettlle/pi-smart-router/issues/162)), TS7/vitest4 ([#163](https://github.com/beettlle/pi-smart-router/issues/163)), ESLint flat config ([#157](https://github.com/beettlle/pi-smart-router/issues/157)) stay on current ranges.
- **Absolute release gates are unchanged** — nothing in the 1.0 train edits `config/release-gates.json`.

## Release train reference

The `1.0.0` train (theme: *1.0 readiness — behavioral calibration quality, maintainable stage/port pipeline architecture, publish/engine honesty, SemVer-stable operator docs*) comprised SP-263 through SP-279. Composition, dependency freshness, and the publish checklist live in the [release manifest](../spine-tasks/_authoring/release-v1.0.0/manifest.md). The exact published version always mirrors `package.json` — see [npm](https://www.npmjs.com/package/pi-smart-router).

---

*Found a gap in this guide? [Open an issue](https://github.com/beettlle/pi-smart-router/issues/new) — migration docs are part of the stability promise.*
