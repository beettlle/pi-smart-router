# Capability profile coverage (dogfood fleet)

Measurable story for HyDRA capability priors on the primary Cursor/pi dogfood fleet: which scoped model IDs resolve with `capability_source=benchmark` vs `pattern_default`. Closes [#108](https://github.com/beettlle/pi-smart-router/issues/108). Parent ingest/mapper work stays closed under [#75](https://github.com/beettlle/pi-smart-router/issues/75).

**Companion:** live QA steps in [`docs/qa/shadow-dogfood-protocol.md`](qa/shadow-dogfood-protocol.md).  
**Artifact:** [`config/benchmark-profiles.json`](../config/benchmark-profiles.json)  
**Resolver:** [`src/config/pi-model-mapper.ts`](../src/config/pi-model-mapper.ts) (`getCapabilitySource`, `resolveBenchmarkModelId`)

## Coverage metric

Define the **primary dogfood fleet** as the fixed ID list below (aligned with the shadow protocol’s economical + frontier + non-Gemini fallback guidance and common Cursor/pi registry IDs).

\[
\text{benchmark\_coverage} = \frac{\#\{\text{id} \in \text{primary fleet} : \texttt{getCapabilitySource(id)} = \texttt{benchmark}\}}{|\text{primary fleet}|}
\]

**Gate:** `benchmark_coverage === 1` for the primary list. Enforced by `tests/unit/pi-model-mapper-coverage.test.ts`.

Intentional `pattern_default` IDs are **outside** the primary list; they are documented in [Intentional gaps](#intentional-gaps) and asserted separately so silent regressions do not hide behind “coverage”.

## Primary dogfood fleet

| Fleet model ID | `capability_source` | Resolution | Notes |
|----------------|---------------------|------------|-------|
| `claude-opus-4-5` | `benchmark` | direct row | Canonical Anthropic frontier row |
| `claude-opus-4` | `benchmark` | alias → `claude-opus-4-5` | Common short registry ID |
| `claude-sonnet-4-6` | `benchmark` | direct row | Canonical Anthropic mid/high row |
| `claude-sonnet-4` | `benchmark` | alias → `claude-sonnet-4-6` | Common short registry ID |
| `claude-3.5-sonnet` | `benchmark` | alias → `claude-sonnet-4-6` | Legacy dated / marketing ID |
| `gpt-5.3-codex` | `benchmark` | direct row | Canonical OpenAI coding row |
| `gpt-5.5` | `benchmark` | alias → `gpt-5.3-codex` | Frontier OpenAI fleet ID |
| `gpt-5.3` | `benchmark` | alias → `gpt-5.3-codex` | Short coding ID |
| `gpt-5` | `benchmark` | alias → `gpt-5.3-codex` | Short family ID |
| `gpt-5-codex` | `benchmark` | alias → `gpt-5.3-codex` | Codex-branded registry ID |
| `gemini-2.5-flash` | `benchmark` | direct row | Canonical Gemini economical row |
| `gemini-2.5-flash-preview` | `benchmark` | alias → `gemini-2.5-flash` | Preview suffix variant |
| `gemini-2.5-flash-lite` | `benchmark` | alias → `gemini-2.5-flash` | Lite variant |
| `gemini-2.0-flash` | `benchmark` | alias → `gemini-2.5-flash` | Prior flash generation ID |
| `gemini-flash-latest` | `benchmark` | alias → `gemini-2.5-flash` | Rolling “latest” ID |
| `cursor/auto` | `benchmark` | alias → `gpt-5.3-codex` | Opaque Cursor auto (protocol non-Gemini fallback) |
| `composer-latest` | `benchmark` | alias → `gpt-5.3-codex` | Composer coding model (protocol non-Gemini fallback) |
| `composer-1` | `benchmark` | alias → `gpt-5.3-codex` | Versioned Composer ID |
| `cursor/composer-latest` | `benchmark` | alias → `gpt-5.3-codex` | Provider-prefixed Composer ID |
| `default` | `benchmark` | alias → `gpt-5.3-codex` | Opaque fleet placeholder (`SP-098`) |

**Current `benchmark_coverage`:** `20/20 = 1.0`.

Aliases live under `aliases` in `config/benchmark-profiles.json` (seeded by `DEFAULT_FLEET_BENCHMARK_ALIASES` in `scripts/ingest-benchmark-profiles.ts`). Re-ingest preserves operator-extended aliases.

## Intentional gaps

These IDs stay on `pattern_default` on purpose. Do **not** invent leaderboard scores or alias them onto a mismatched family row.

| Fleet model ID (examples) | Why `pattern_default` | Operator guidance |
|---------------------------|------------------------|-------------------|
| `claude-haiku-*`, `claude-3-5-haiku` | No Haiku row in the checked-in ingest catalog | Family regex → economical defaults; add a grounded row via ingest when a leaderboard snapshot exists |
| `gpt-5-mini`, `gpt-5.1-mini` | No mini/economical OpenAI row in catalog | Pattern → economical; prefer alias only onto a true mini/flash-class row after ingest |
| `gemini-2.5-pro`, `gemini-*-pro` | Catalog currently ships Flash, not Pro | Avoid aliasing Pro → Flash (would understate capability); extend ingest when Pro scores are available |
| Local (`ollama` / `lmstudio` ids) | Arbitrary local checkpoints have no public leaderboard | Zero-tier pattern defaults; optional private override path for operators |
| Unknown / one-off registry IDs | No row and no alias | Conservative economical `UNKNOWN_DEFAULTS`; add alias only to an existing canonical `models[].model_id` |

## How to extend coverage

1. Prefer a real ingest row from `npm run routing:ingest-benchmarks` (fixtures or `--live`).
2. Add `"fleet-id": "canonical-model_id"` under `aliases` only when the canonical row already exists.
3. Extend the primary list + unit test expectations together so the metric stays honest.
4. Confirm with `npm run routing:verify-benchmark-profiles` and `npx vitest run tests/unit/pi-model-mapper-coverage.test.ts`.

Do **not** reopen [#75](https://github.com/beettlle/pi-smart-router/issues/75) for alias/docs work — that issue owns core ingest/mapper (landed). Coverage follow-ons stay on [#108](https://github.com/beettlle/pi-smart-router/issues/108).

## Related

| Link | Role |
|------|------|
| [`docs/qa/shadow-dogfood-protocol.md`](qa/shadow-dogfood-protocol.md) | Live dogfood matrix + sign-off |
| [`docs/routing-roadmap.md`](routing-roadmap.md) §2 | Roadmap status (owned by SP-197; points at #108) |
| `npm run routing:ingest-benchmarks` | Regenerate profiles |
| `npm run routing:verify-benchmark-profiles` | CI smoke vs fixture ingest |
