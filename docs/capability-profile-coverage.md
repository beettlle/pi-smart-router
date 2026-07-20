# Capability profile coverage (fixture list)

Measurable story for HyDRA capability priors on the primary **capability-coverage fixture** list: which IDs resolve with `capability_source=benchmark` vs `pattern_default`. Closes [#108](https://github.com/beettlle/pi-smart-router/issues/108). Multi-fleet extension (Copilot / Gemini / Anthropic catalog strings) closes [#124](https://github.com/beettlle/pi-smart-router/issues/124). Parent ingest/mapper work stays closed under [#75](https://github.com/beettlle/pi-smart-router/issues/75).

**Companion:** live QA with any qualifying scoped fleet — [`docs/qa/shadow-dogfood-protocol.md`](qa/shadow-dogfood-protocol.md). That protocol does **not** require the fixture IDs below.
**Artifact:** [`config/benchmark-profiles.json`](../config/benchmark-profiles.json)
**Resolver:** [`src/config/pi-model-mapper.ts`](../src/config/pi-model-mapper.ts) (`getCapabilitySource`, `resolveBenchmarkModelId`)

## Coverage metric

Define the **primary capability-coverage fixture** as the fixed Cursor/pi ID list below (checked-in mapper gate for #108). The **multi-fleet fixture** (Copilot / Gemini / Anthropic) extends coverage for #124. Rows may include Cursor/composer registry ids as fixture aliases; they are not a live dogfood fleet requirement.

\[
\text{benchmark\_coverage} = \frac{\#\{\text{id} \in \text{fixture} : \texttt{getCapabilitySource(id)} = \texttt{benchmark}\}}{|\text{fixture}|}
\]

**Gate:** `benchmark_coverage === 1` for **both** the primary list and the multi-fleet list. Enforced by `tests/unit/pi-model-mapper-coverage.test.ts`.

Intentional `pattern_default` IDs are **outside** both fixtures; they are documented in [Intentional gaps](#intentional-gaps) and asserted separately so silent regressions do not hide behind “coverage”.

## Primary capability-coverage fixture

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
| `cursor/auto` | `benchmark` | alias → `gpt-5.3-codex` | Opaque Cursor auto (fixture row) |
| `composer-latest` | `benchmark` | alias → `gpt-5.3-codex` | Composer coding model (fixture row) |
| `composer-1` | `benchmark` | alias → `gpt-5.3-codex` | Versioned Composer ID |
| `cursor/composer-latest` | `benchmark` | alias → `gpt-5.3-codex` | Provider-prefixed Composer ID |
| `default` | `benchmark` | alias → `gpt-5.3-codex` | Opaque fleet placeholder (`SP-098`) |

**Current `benchmark_coverage`:** `20/20 = 1.0`.

Aliases live under `aliases` in `config/benchmark-profiles.json` (seeded by `DEFAULT_FLEET_BENCHMARK_ALIASES` in `scripts/ingest-benchmark-profiles.ts`). Re-ingest preserves operator-extended aliases.

## Multi-fleet dogfood coverage (Copilot / Gemini / Anthropic) — #124

Extension of the primary list for common **multi-fleet** dogfood IDs. The governing principle is **no silent provider-family collapse**: a fleet ID that surfaces a model from a known provider must alias onto that provider’s grounded row, never onto a mismatched family.

Concrete rule for GitHub Copilot (`github-copilot/*`), which re-exposes models from several providers behind one fleet prefix:

| Copilot surfaces | Must resolve to | Would be WRONG |
|------------------|------------------|----------------|
| a Claude model | Anthropic row (`claude-sonnet-4-6` / `claude-opus-4-5`) | OpenAI `gpt-5.3-codex` |
| a GPT model | OpenAI row (`gpt-5.3-codex`) | — |
| a Gemini model | Gemini row (`gemini-2.5-flash`) | OpenAI `gpt-5.3-codex` |

Silently collapsing a Copilot-Claude or Copilot-Gemini onto the OpenAI codex row would misrepresent its capability vector (it would inherit gpt-5.3-codex scores). The aliases below resolve each Copilot ID to the **underlying provider family**, asserted by `tests/unit/pi-model-mapper-coverage.test.ts`.

| Fleet model ID | `capability_source` | Resolution | One-line rationale |
|------------------|---------------------|------------|---------------------|
| `claude-opus-4.1` | `benchmark` | alias → `claude-opus-4-5` | Dot-notation Opus registry id; Anthropic frontier family |
| `claude-sonnet-4.5` | `benchmark` | alias → `claude-sonnet-4-6` | Dot-notation Sonnet id; Anthropic mid/high family |
| `claude-3-7-sonnet` | `benchmark` | alias → `claude-sonnet-4-6` | Legacy 3.7 Sonnet hyphen id; Anthropic family |
| `claude-3.7-sonnet` | `benchmark` | alias → `claude-sonnet-4-6` | Legacy 3.7 Sonnet dot id; Anthropic family |
| `anthropic/claude-sonnet-4` | `benchmark` | alias → `claude-sonnet-4-6` | Provider-prefixed registry id; Anthropic family |
| `gemini-1.5-flash` | `benchmark` | alias → `gemini-2.5-flash` | Prior flash generation; Gemini economical family |
| `gemini-2.0-flash-001` | `benchmark` | alias → `gemini-2.5-flash` | Versioned 2.0 flash; Gemini economical family |
| `gemini-2.5-flash-002` | `benchmark` | alias → `gemini-2.5-flash` | Versioned 2.5 flash; Gemini economical family |
| `google/gemini-2.5-flash` | `benchmark` | alias → `gemini-2.5-flash` | Provider-prefixed registry id; Gemini family |
| `github-copilot/claude-sonnet-4.5` | `benchmark` | alias → `claude-sonnet-4-6` | Copilot surfaces a Claude → **Anthropic** row (no OpenAI collapse) |
| `github-copilot/claude-3.5-sonnet` | `benchmark` | alias → `claude-sonnet-4-6` | Copilot surfaces legacy Claude → Anthropic row |
| `github-copilot/gpt-5` | `benchmark` | alias → `gpt-5.3-codex` | Copilot surfaces a GPT → OpenAI row |
| `github-copilot/gpt-5-codex` | `benchmark` | alias → `gpt-5.3-codex` | Copilot surfaces Codex-branded GPT → OpenAI row |
| `github-copilot/gemini-2.5-flash` | `benchmark` | alias → `gemini-2.5-flash` | Copilot surfaces a Gemini → **Gemini** row (no OpenAI collapse) |
| `github-copilot/gemini-2.0-flash` | `benchmark` | alias → `gemini-2.5-flash` | Copilot surfaces legacy Gemini → Gemini row |

**Multi-fleet `benchmark_coverage`:** `15/15 = 1.0`. Combined with the primary fixture, the checked-in aliases ground **35** dogfood IDs across the Cursor/pi, Anthropic, Gemini, OpenAI, and Copilot fleets.

Aliases for `github-copilot/o3`, `github-copilot/o4-mini`, `github-copilot/gpt-4o`, and `github-copilot/gemini-2.5-pro` are **deliberately omitted** — see [Intentional gaps](#intentional-gaps). Aliasing them onto a mismatched row would be the very silent collapse this section forbids.

## Intentional gaps

These IDs stay on `pattern_default` on purpose. Do **not** invent leaderboard scores or alias them onto a mismatched family row.

| Fleet model ID (examples) | Why `pattern_default` | Operator guidance |
|---------------------------|------------------------|-------------------|
| `claude-haiku-*`, `claude-3-5-haiku`, `claude-3-7-haiku` | No Haiku row in the checked-in ingest catalog | Family regex → economical defaults; add a grounded row via ingest when a leaderboard snapshot exists |
| `gpt-5-mini`, `gpt-5.1-mini` | No mini/economical OpenAI row in catalog | Pattern → economical; prefer alias only onto a true mini/flash-class row after ingest |
| `gemini-2.5-pro`, `gemini-*-pro`, `github-copilot/gemini-2.5-pro` | Catalog currently ships Flash, not Pro | Avoid aliasing Pro → Flash (would understate capability); extend ingest when Pro scores are available |
| `gemini-2.5-flash-tts`, `gemini-*-native-audio` | Non-coding media variants have no coding leaderboard | Keep pattern default; a TTS/audio model is not a routing target for code/tool turns |
| `github-copilot/o3`, `github-copilot/o4-mini` | Reasoning models with no checked-in ingest row | Pattern default; do **not** alias onto `gpt-5.3-codex` (different capability profile). Add a row via ingest when scores exist |
| `github-copilot/gpt-4o` | Catalog is gpt-5.x; no gpt-4o row | Pattern default; alias only to an existing OpenAI canonical row after ingest |
| Local (`ollama` / `lmstudio` ids) | Arbitrary local checkpoints have no public leaderboard | Zero-tier pattern defaults; optional private override path for operators |
| Unknown / one-off registry IDs | No row and no alias | Conservative economical `UNKNOWN_DEFAULTS`; add alias only to an existing canonical `models[].model_id` |

## How to extend coverage

1. Prefer a real ingest row from `npm run routing:ingest-benchmarks` (fixtures or `--live`).
2. Add `"fleet-id": "canonical-model_id"` under `aliases` only when the canonical row already exists **and** shares the underlying provider family. Multi-fleet IDs (e.g. `github-copilot/<model>`) must alias to the row of the model they actually surface — never collapse a Claude or Gemini behind a foreign prefix onto the OpenAI row.
3. Extend the relevant fixture list (primary or multi-fleet) + unit test expectations together so the metric stays honest.
4. Confirm with `npm run routing:verify-benchmark-profiles` and `npx vitest run tests/unit/pi-model-mapper-coverage.test.ts`.

Do **not** reopen [#75](https://github.com/beettlle/pi-smart-router/issues/75) for alias/docs work — that issue owns core ingest/mapper (landed). Coverage follow-ons stay on [#108](https://github.com/beettlle/pi-smart-router/issues/108) / [#124](https://github.com/beettlle/pi-smart-router/issues/124).

## Related

| Link | Role |
|------|------|
| [`docs/qa/shadow-dogfood-protocol.md`](qa/shadow-dogfood-protocol.md) | Live dogfood matrix + sign-off (any qualifying fleet; not this fixture list) |
| [`docs/routing-roadmap.md`](routing-roadmap.md) §2 | Roadmap status (owned by SP-197; points at #108) |
| `npm run routing:ingest-benchmarks` | Regenerate profiles |
| `npm run routing:verify-benchmark-profiles` | CI smoke vs fixture ingest |
