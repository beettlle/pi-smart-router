# Quickstart: Auto-Model Router MVP

**Feature**: 001-build-smart-router | **Date**: 2026-07-02

## Prerequisites

- macOS Apple Silicon
- Node.js 20 LTS
- Optional: Redis (`REDIS_URL=redis://localhost:6379`)
- Optional: LM Studio (port 1234) or Ollama (port 11434) with a model loaded

## Bootstrap (first-time repo setup)

```bash
cd /Users/cdelgado/Documents/github/pi-smart-router
npm init -y
npm install typescript @types/node vitest zod yaml aho-corasick-node @typescript-eslint/parser ioredis @huggingface/transformers
npm install -D @typescript-eslint/eslint-plugin eslint
npx tsc --init --strict --module nodenext --moduleResolution nodenext
cp config/models.yaml.example config/models.yaml
```

Build verification pending until package scripts exist (see `/spec:tasks`).

## Configure Fleet Catalog

Edit `config/models.yaml` with at least one model per tier:

- `zero-tier` — local (LM Studio / Ollama)
- `economical-cloud` — cheap cloud model
- `frontier-cloud` — capable cloud model

See [data-model.md](./data-model.md) ModelProfile and PRD §5 schema.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `REDIS_URL` | No | Session pins + rate limits; omit for in-memory dev |
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

1. Start Redis (optional): `redis-server`
2. Start LM Studio or Ollama with a small model loaded
3. Run tests: `npm run typecheck && npm test`
4. Send test prompts through pipeline unit tests in `tests/integration/`

## Verify MVP Success Criteria

| Check | Command / action |
|-------|------------------|
| Trivial → economical | Run triage test fixtures (`tests/unit/triage-engine.test.ts`) |
| Pin stability | Multi-turn integration test without compaction |
| Zero crash on local down | Stop LM Studio; verify cloud fallback |
| Explain parity | Compare explain vs live path for same payload (SC-010) |

## Next Steps

- `/spec:tasks` — break lanes into spine-ready task packets
- `spine doctor` — validate spine config before batch
