/**
 * LiveCodeBench native live adapter — SP-183 / GitHub #104.
 *
 * Source:
 * https://raw.githubusercontent.com/LiveCodeBench/livecodebench.github.io/main/src/mocks/performances_generation.json
 *
 * Payload shape:
 *   { performances: [{ model, pass@1, date, ... }], models: [{ model_name, model_repr, ... }] }
 *
 * Aggregation policy (documented choice — mean vs latest-window):
 *   Prefer **full-payload mean** of per-question `pass@1` for each `model` key.
 *   LiveCodeBench’s UI can filter by `date_marks` windows; those windows are
 *   presentation-specific and change as the mock refreshes. Averaging every
 *   performance row in the fetched payload is stable, reproducible for CI, and
 *   matches the overall pass@1 intent when the mock is the evaluation set.
 *   We do **not** invent scores; unmapped models are skipped.
 */

import {
  BENCHMARK_SOURCE_URLS,
  BenchmarkIngestError,
  type BenchmarkLeaderboardEntry,
  type BenchmarkLeaderboardFixture,
} from '../../ingest-benchmark-profiles.js';

import type { AdapterFetchContext, LeaderboardAdapter } from './types.js';

/** Default machine-readable LiveCodeBench performances JSON. */
export const LIVECODEBENCH_LIVE_FETCH_URL =
  'https://raw.githubusercontent.com/LiveCodeBench/livecodebench.github.io/main/src/mocks/performances_generation.json';

/**
 * Map LiveCodeBench `model_repr` / `model_name` / performance `model` keys →
 * catalog `model_id`s used in fixtures / fleet aliases.
 *
 * Only explicit, confident mappings — never invent scores for unknown names.
 * Prefer non-thinking variants when both thinking and non-thinking rows exist
 * for the same catalog id (listed first; first-wins on collision).
 */
export const LIVECODEBENCH_MODEL_ID_MAP: Readonly<Record<string, string>> = {
  // Anthropic — non-thinking preferred
  'Claude-Opus-4': 'claude-opus-4-5',
  'claude-opus-4-20250514_nothink': 'claude-opus-4-5',
  'Claude-Sonnet-4': 'claude-sonnet-4-6',
  'claude-sonnet-4-20250514_nothink': 'claude-sonnet-4-6',
  // Gemini flash preview → gemini-2.5-flash fixture row
  'Gemini-2.5-Flash-Preview': 'gemini-2.5-flash',
  'gemini-2.5-flash-preview-04-17': 'gemini-2.5-flash',
  // Claude-3-Haiku / GPT-*/O* / DeepSeek / etc. are left unmapped — skip, never invent.
};

interface LcbPerformanceRow {
  readonly model: string;
  readonly 'pass@1': number;
}

interface LcbModelMeta {
  readonly model_name?: string;
  readonly model_repr?: string;
}

interface LcbPayload {
  readonly performances: readonly LcbPerformanceRow[];
  readonly models?: readonly LcbModelMeta[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePassAt1(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (value < 0 || value > 100) {
    return undefined;
  }
  return value;
}

/**
 * Build lookup from any LCB model key (repr / name / performance model) → catalog id.
 * `models[]` metadata enriches the static map; static map still wins for known keys.
 */
export function buildLiveCodeBenchModelLookup(
  models: readonly LcbModelMeta[] | undefined,
  staticMap: Readonly<Record<string, string>> = LIVECODEBENCH_MODEL_ID_MAP,
): ReadonlyMap<string, string> {
  const lookup = new Map<string, string>(Object.entries(staticMap));

  if (models === undefined) {
    return lookup;
  }

  for (const meta of models) {
    const repr = typeof meta.model_repr === 'string' ? meta.model_repr.trim() : '';
    const name = typeof meta.model_name === 'string' ? meta.model_name.trim() : '';
    const catalogFromRepr = repr.length > 0 ? lookup.get(repr) : undefined;
    const catalogFromName = name.length > 0 ? lookup.get(name) : undefined;
    const catalogId = catalogFromRepr ?? catalogFromName;
    if (catalogId === undefined) {
      continue;
    }
    if (repr.length > 0 && !lookup.has(repr)) {
      lookup.set(repr, catalogId);
    }
    if (name.length > 0 && !lookup.has(name)) {
      lookup.set(name, catalogId);
    }
  }

  return lookup;
}

/**
 * Aggregate per-model mean pass@1 and emit fixture entries for mapped catalog ids.
 * Unmapped models are skipped. When multiple LCB keys map to the same catalog id,
 * the first observed mapped source model wins (stable insertion order).
 */
export function aggregateLiveCodeBenchPerformances(
  payload: LcbPayload,
  modelLookup: ReadonlyMap<string, string> = buildLiveCodeBenchModelLookup(payload.models),
): BenchmarkLeaderboardEntry[] {
  const sums = new Map<string, { sum: number; count: number }>();
  /** catalog model_id → first LCB source key that claimed it */
  const claimedBy = new Map<string, string>();

  for (const row of payload.performances) {
    if (typeof row.model !== 'string' || row.model.trim().length === 0) {
      continue;
    }
    const sourceKey = row.model.trim();
    const catalogId = modelLookup.get(sourceKey);
    if (catalogId === undefined) {
      continue;
    }

    const existingClaim = claimedBy.get(catalogId);
    if (existingClaim !== undefined && existingClaim !== sourceKey) {
      // Collision: another LCB model already owns this catalog id — skip.
      continue;
    }
    claimedBy.set(catalogId, sourceKey);

    const pass = parsePassAt1(row['pass@1']);
    if (pass === undefined) {
      continue;
    }

    const agg = sums.get(catalogId) ?? { sum: 0, count: 0 };
    agg.sum += pass;
    agg.count += 1;
    sums.set(catalogId, agg);
  }

  const entries: BenchmarkLeaderboardEntry[] = [];
  for (const [modelId, agg] of sums) {
    if (agg.count === 0) {
      continue;
    }
    // One decimal place — matches checked-in fixture style; still source-derived.
    const score = Math.round((agg.sum / agg.count) * 10) / 10;
    entries.push({ model_id: modelId, score });
  }

  entries.sort((a, b) => a.model_id.localeCompare(b.model_id));
  return entries;
}

export function parseLiveCodeBenchPayload(text: string, sourceLabel: string): LcbPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new BenchmarkIngestError(`Invalid JSON for livecodebench (${sourceLabel})`, {
      cause: err,
    });
  }

  if (!isRecord(parsed)) {
    throw new BenchmarkIngestError(
      `LiveCodeBench payload must be an object (${sourceLabel})`,
    );
  }

  const performancesRaw = parsed.performances;
  if (!Array.isArray(performancesRaw)) {
    throw new BenchmarkIngestError(
      `LiveCodeBench payload missing performances[] (${sourceLabel})`,
    );
  }

  const performances: LcbPerformanceRow[] = [];
  for (const row of performancesRaw) {
    if (!isRecord(row)) {
      continue;
    }
    const model = row.model;
    const pass = row['pass@1'];
    if (typeof model !== 'string') {
      continue;
    }
    const passAt1 = parsePassAt1(pass);
    if (passAt1 === undefined) {
      continue;
    }
    performances.push({ model, 'pass@1': passAt1 });
  }

  if (performances.length === 0) {
    throw new BenchmarkIngestError(
      `LiveCodeBench payload has no usable performances (${sourceLabel})`,
    );
  }

  let models: LcbModelMeta[] | undefined;
  if (Array.isArray(parsed.models)) {
    models = parsed.models.filter(isRecord).map((m) => ({
      ...(typeof m.model_name === 'string' ? { model_name: m.model_name } : {}),
      ...(typeof m.model_repr === 'string' ? { model_repr: m.model_repr } : {}),
    }));
  }

  return {
    performances,
    ...(models !== undefined ? { models } : {}),
  };
}

async function fetchLiveCodeBenchBody(ctx: AdapterFetchContext): Promise<string> {
  const { url, fetchFn, signal, timeoutMs } = ctx;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = (): void => {
    controller.abort();
  };
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  let response: Response;
  try {
    response = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new BenchmarkIngestError(
      `Live fetch failed for livecodebench (${url}): ${detail}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    throw new BenchmarkIngestError(
      `Live fetch HTTP ${response.status} for livecodebench (${url})`,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new BenchmarkIngestError(`Live fetch body read failed for livecodebench (${url})`, {
      cause: err,
    });
  }

  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new BenchmarkIngestError(`Live fetch returned empty body for livecodebench (${url})`);
  }
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
    throw new BenchmarkIngestError(
      `Live fetch for livecodebench returned HTML, not performances JSON (${url})`,
    );
  }

  return trimmed;
}

export const livecodebenchAdapter: LeaderboardAdapter = {
  id: 'livecodebench',
  provenanceUrl: BENCHMARK_SOURCE_URLS.livecodebench,
  liveFetchUrl: LIVECODEBENCH_LIVE_FETCH_URL,
  async fetchAndNormalize(ctx: AdapterFetchContext): Promise<BenchmarkLeaderboardFixture> {
    const body = await fetchLiveCodeBenchBody(ctx);
    const payload = parseLiveCodeBenchPayload(body, ctx.url);
    const lookup = buildLiveCodeBenchModelLookup(payload.models);
    const entries = aggregateLiveCodeBenchPerformances(payload, lookup);

    if (entries.length === 0) {
      throw new BenchmarkIngestError(
        `LiveCodeBench adapter produced zero mapped entries (${ctx.url}); ` +
          'all models were unmapped or lacked usable pass@1',
      );
    }

    return {
      benchmark: 'livecodebench',
      source_url: BENCHMARK_SOURCE_URLS.livecodebench,
      scrape_date: ctx.scrapeDate,
      entries,
    };
  },
};
