**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-07-04
**Review Level:** 2
**Size:** M

---

## Step 1: LiteLLM fetch helper

**Status:** Not Started

- [ ] Fetch and normalize LiteLLM pricing JSON
- [ ] Env var `LITELLM_PRICING_URL` with default
- [ ] Unit tests with mocked fetch

## Step 2: Manual refresh command

**Status:** Not Started

- [ ] `/smart-router pricing refresh` subcommand
- [ ] Persist catalog to SQLite and rebuild fleet
- [ ] No automatic background fetch

## Step 3: Fleet build integration

**Status:** Not Started

- [ ] Load catalog during fleet build
- [ ] Apply `resolveFleetPrices` to fleet profiles
- [ ] Staleness warning on status/session start

## Step 4: Testing and verification

**Status:** Not Started

- [ ] Run `npm run typecheck && npm test`
