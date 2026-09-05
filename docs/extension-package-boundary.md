# Extension package boundary — public facade, coverage gate, and supply-chain posture

**Release:** v0.22.0 theme notes (SP-262)
**Theme:** Extension package boundary and ONNX embedder supply-chain integrity (#149, #144, #147)

This doc is the operator/embedder reference for what pi-smart-router exposes as
**supported API** versus internal implementation, how extension code is held to
the same coverage gate as the routing core, and where the ONNX supply-chain
controls live. It describes **shipped behavior only**.

---

## Public facade vs internal API

### Package surface

The npm package exports exactly one entry point (`package.json` `exports`):

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

That entry point is `src/index.ts` — the **public facade**. It exports the
router factories and lifecycle registrar listed in the README
[API section](../README.md#public-exports): `createRouter`,
`createRouterFromFleet`, `createPiRouterMiddleware`, `LifecycleHookState`, and
the `RoutingDecision` / `ModelProfile` / `PiRouterMiddleware` /
`PiExtensionHooks` / `RouterHandle` types.

### Internal API — not supported

Deep imports into `src/**` subpaths (e.g.
`pi-smart-router/src/domain/pipeline/...`) are **not a stable API**. Internal
modules move, split, and rename between releases without notice. The extension
itself previously imported `src/**` internals directly; that gap is closed in
favor of the facade.

**Enforcement (SP-257, #149):** an ESLint `no-restricted-imports` guard runs on
`.pi/extensions/**/*.ts` and fails the build on any deep src import:

- Banned: `../../../src/*/**` and `../../../src/!(index).js`
- Allowed: the facade `../../../src/index.js`

The extension tree is also re-included in `npm run lint` (ESLint's default
dot-directory ignore previously skipped `.pi/extensions/**` entirely), so the
guard runs in CI via `npm run verify:ci`. The rule is fail-closed: a temporary
deep-import probe exits 1, a facade probe exits 0.

If you are embedding the library and something you need is not on the facade,
open an issue against [#149](https://github.com/beettlle/pi-smart-router/issues/149)
rather than importing internals — facade additions are cheap; deep-import
breakage is not.

## Extension coverage gate (#144)

Extension code ships in the npm package and runs inside pi, so it is held to
the same coverage gate as `src/`:

- `vitest.config.ts` coverage `include` covers **both**
  `src/**/*.ts` and `.pi/extensions/smart-router/**/*.ts`.
- Thresholds (combined src + extension, SP-258): **80%** for lines, functions,
  branches, and statements. `spine-tasks/**` is excluded.
- Gate command: **`npm run coverage:check`** (`vitest run --coverage`). It is
  part of `npm run verify:ci` (build → typecheck → lint → coverage), so a
  coverage regression fails CI.

Measured at gate introduction (2026-09-05): combined lines/statements 91.45%,
functions 96.42%, branches 87.64%; extension-only baseline lines 82.28%,
branches 79.4%. Thresholds start at 80% and ratchet up — do not lower them to
land a change; add tests instead.

See the README [Scripts table](../README.md#scripts) for the full command list.

## Supply-chain: pins, offline cache, dispose (#147)

The ONNX embedder supply-chain posture is documented in the README
[Supply-chain section](../README.md#supply-chain-artifact-pins-offline-cache-and-audit-posture);
summary and cross-links here:

- **Digest pins (SP-259).** Cached ONNX artifacts are verified against SHA-256
  pins in [`config/onnx-artifact-pins.json`](../config/onnx-artifact-pins.json).
  Mode via `SMART_ROUTER_ONNX_PIN_MODE`: `off` (default) / `verify` /
  `enforce` (pins required; missing or mismatched digests fail closed).
  Pin file location override: `SMART_ROUTER_ONNX_PIN_FILE`.
- **Offline / air-gapped cache.** Warm `.pi-smart-router/models/` on a
  networked host (any routed request, or
  `npm run benchmark:encoder -- --cache .pi-smart-router/models/`), verify
  pins during the warm, then copy the cache plus the pin file to the offline
  host and point `hydra.artifact_cache_path` at it. Defense in depth:
  `env.allowRemoteModels = false` forbids any network fetch.
- **`npm audit` posture.** Accepted-risk advisories in the
  `@huggingface/transformers` → `onnxruntime-node` chain have no upstream fix;
  rationale and monitoring policy are in the README section above. New
  high-severity advisories need a documented exception — silent dismissals are
  release blockers.
- **Embedder dispose (SP-260).** Embedders expose `dispose()` which releases
  the underlying ONNX inference sessions (falling back to the wrapped model's
  `dispose()` when needed). A disposed embedder **fails closed**: subsequent
  `embed()` calls throw instead of using released sessions. Dispose embedders
  when tearing down routing handles in long-lived hosts.

## Out of scope

The domain pipeline split (#143) and remaining facade migration items (#96) are
**not shipped** in this release and are intentionally not documented here as
done. Track the issues for progress.
