# SP-084 Status

**Current Step:** Step 1
**Status:** pending

## Step 1: Empty-fleet detection and fail-safe
- [ ] Add helper or metadata when effectiveFleet is empty after filter
- [ ] Honor force_model_id override
- [ ] Throw actionable error when no routable non-Gemini model remains

## Step 2: Wire route-and-delegate fail-fast
- [ ] Block delegation before unknown model id
- [ ] Unit tests for google-only and cursor/auto fleets

## Step 3: Docs and integration test
- [ ] Extension integration test
- [ ] README troubleshooting section
- [ ] Run npm run typecheck && npm test

## Completion Criteria
- [ ] All acceptance criteria from PROMPT met
- [ ] Tests pass
