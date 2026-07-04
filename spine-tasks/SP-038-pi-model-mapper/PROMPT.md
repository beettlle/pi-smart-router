# Task: SP-038 — Pi Model Mapper

**Created:** 2026-07-03
**Size:** S

## Review Level: 1

**Assessment:** Lookup table mapping pi model IDs to ModelProfile.
**Score:** 2/8

## Mission

Create `src/config/pi-model-mapper.ts` with a function `mapPiModelToProfile()` that maps pi `Model` objects to the router's `ModelProfile` type. Includes a pattern-based lookup table for known model families (Claude, GPT, Gemini, local) with tier, capabilities, and pricing defaults. Unknown models get conservative economical-cloud defaults.

## Dependencies

- SP-037

## Context to Read First

- `src/domain/types/entities.ts` — `ModelProfile`, `Tier`, `ModelCapabilities`
- `src/domain/types/schemas.ts` — `ModelProfileSchema`
- `config/models.yaml.example` — reference capability scores

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts`, `tests/unit/pi-model-mapper.test.ts` |
| Must NOT change | `src/domain/types/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `src/domain/types/**` |

## Steps

### Step 1: Model mapper module

- [ ] Create `src/config/pi-model-mapper.ts`
- [ ] Define `PiModelInput` interface: `{ provider: string; id: string; name?: string }`
- [ ] Build pattern table: claude-opus/sonnet → frontier, claude-haiku → economical, gpt-5.5 → frontier, gpt-5.1/mini → economical, gemini-2.5-pro → frontier, gemini-flash → economical, lmstudio/ollama → zero-tier
- [ ] Export `mapPiModelToProfile(input: PiModelInput): ModelProfile`
- [ ] Export `mapFleetFromRegistry(models: PiModelInput[]): ModelProfile[]`

### Step 2: Unit tests

- [ ] Test each known model family maps to correct tier and capabilities
- [ ] Test unknown model gets conservative defaults
- [ ] Test local provider detection (lmstudio, ollama)

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-038): description`

## Do NOT

- Modify domain types (`src/domain/types/**`)
- Import from `@earendil-works/pi-coding-agent` at runtime (types only)

---

## Amendments (Added During Execution)
