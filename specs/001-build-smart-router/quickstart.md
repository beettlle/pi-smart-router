# Quickstart: Auto-Model Router MVP

**Feature**: 001-build-smart-router | **Date**: 2026-07-02

## Prerequisites

- macOS Apple Silicon
- Node.js 20 LTS
- SQLite via `better-sqlite3` (default: `.pi-smart-router/state.db` — created automatically)
- Optional: LM Studio (port 1234) or Ollama (port 11434) with a model loaded

## Bootstrap (first-time repo setup)

```bash
cd /Users/cdelgado/Documents/github/pi-smart-router
npm init -y
npm install typescript @types/node vitest zod yaml aho-corasick-node @typescript-eslint/parser better-sqlite3 @huggingface/transformers
npm install -D @typescript-eslint/eslint-plugin eslint
npx tsc --init --strict --module nodenext --moduleResolution nodenext
cp config/models.yaml.example config/models.yaml
```

Build verification pending until package scripts exist (see [tasks.md](./tasks.md)).

## HyDRA Model Cache Bootstrap

Embedding matcher weights are downloaded at runtime (not committed to git). On first run, `@huggingface/transformers` caches ONNX artifacts under `.pi-smart-router/models/` (configurable via `hydra.artifact_cache_path` in [data-model.md](./data-model.md)).

```bash
mkdir -p .pi-smart-router/models
# First pipeline run with matcher enabled triggers download of Xenova/all-MiniLM-L6-v2
```

Ensure `.pi-smart-router/` is gitignored (covers both `state.db` and `models/`).

## Cost vs Quality Preference

Configure multi-objective routing weights in operator config (defaults from [data-model.md](./data-model.md)):

| Key | Default | Effect |
|-----|---------|--------|
| `frugality.lambda_cost` | 0.5 | Higher → favor economical tiers at quality parity |
| `frugality.lambda_latency` | 0.1 | Higher → favor lower-latency models |
| `frugality.lambda_verbosity` | 0.15 | Higher → favor less verbose models |

Loaded by `src/config/defaults.ts` (task T012); consumed by multi-objective scorer (task T049).

## Configure Fleet Catalog

Edit `config/models.yaml` with at least one model per tier:

- `zero-tier` — local (LM Studio / Ollama)
- `economical-cloud` — cheap cloud model
- `frontier-cloud` — capable cloud model

See [data-model.md](./data-model.md) ModelProfile and PRD §5 schema.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ROUTER_STATE_DB_PATH` | No | Default `./.pi-smart-router/state.db` |
| `MODELS_YAML_PATH` | No | Default `./config/models.yaml` |
| `ROUTER_SAFE_DEFAULT_TIER` | No | Default `economical-cloud` |
| `LITELLM_PRICING_URL` | No | LiteLLM pricing JSON source |

## Enable Router in pi.dev

Integration hook (Lane 4.1 — implementation pending):

```bash
# Planned: pi-router-install stretch goal
pi config set router.enabled true
pi config set router.modelsPath ./config/models.yaml
```

Middleware intercepts LLM requests before upstream dispatch.

## Explain a Routing Decision (no inference)

```bash
# Planned CLI (Lane 4.3)
pi router explain --session-id <id> --payload @request.json
```

Or HTTP:

```bash
curl -X POST http://localhost:3000/v1/route/explain \
  -H 'Content-Type: application/json' \
  -d @request.json
```

Response includes `tier`, `stage`, `reason_code`, `candidates`, `estimated_cost_usd`.

## Local Development Loop

1. Ensure `.pi-smart-router/state.db` is writable (created on first run)
2. Start LM Studio or Ollama with a small model loaded
3. Run tests: `npm run typecheck && npm test`
4. Send test prompts through pipeline unit tests in `tests/integration/`

## Verify MVP Success Criteria

| Check | Command / action |
|-------|------------------|
| Trivial → economical | Run triage test fixtures (`tests/unit/triage-engine.test.ts`) |
| Obvious-case latency (SC-004) | Step 2 triage exit <5ms median on obvious-case fixtures |
| Ambiguous overhead (SC-005) | `tests/integration/routing-latency.test.ts` — median <200ms |
| Cost vs frontier baseline (SC-009) | `tests/integration/cost-baseline.test.ts` — mocked pricing comparison |
| Pin stability | Multi-turn integration test without compaction |
| Zero crash on local down | Stop LM Studio; verify cloud fallback |
| Explain parity | Compare explain vs live path for same payload (SC-010) |

## Next Steps

- `/spec:implement` — begin Phase 1 setup tasks
- [tasks.md](./tasks.md) T065–T066 — break lanes into spine-ready task packets
- `spine doctor` — validate spine config before batch
