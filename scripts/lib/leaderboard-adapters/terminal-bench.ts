/**
 * Terminal-Bench live adapter — SP-185 / GitHub #104.
 *
 * Investigation (2026-07-10): no free, stable, machine-readable aggregate exists.
 * - `https://www.tbench.ai/leaderboard` is HTML only (not JSON).
 * - `api.tbench.ai` does not resolve; Parse marketplace API requires a key — never the default.
 * - Hugging Face `harborframework/terminal-bench-2-leaderboard` is submissions-only (no aggregate).
 * - Cross-bench mirrors checked (e.g. ALL-Bench) do not include Terminal-Bench scores.
 *
 * Live path: operators point `--live-url terminal_bench=URL` at a fixture-shaped JSON
 * mirror (schema below). With no override, `--live` skips live fetch and falls back to
 * recorded / checked-in fixtures — scores are never invented.
 */

import {
  BENCHMARK_SOURCE_URLS,
  BenchmarkIngestError,
  DEFAULT_FLEET_BENCHMARK_ALIASES,
  parseBenchmarkLeaderboardFixture,
  type BenchmarkLeaderboardEntry,
  type BenchmarkLeaderboardFixture,
} from '../../ingest-benchmark-profiles.js';

import type { AdapterFetchContext, LeaderboardAdapter } from './types.js';

/**
 * Operator mirror schema (fixture-shaped). Host this JSON at any https URL and pass
 * `--live-url terminal_bench=<url>`.
 *
 * ```json
 * {
 *   "benchmark": "terminal_bench",
 *   "source_url": "https://www.tbench.ai/leaderboard",
 *   "scrape_date": "YYYY-MM-DD",
 *   "entries": [{ "model_id": "claude-opus-4-5", "score": 72.5 }]
 * }
 * ```
 *
 * `score` is 0–100 (percent). Optional `tool_call_snippet` is allowed by the ingest schema.
 * Paid Parse / tbench marketplace APIs must not be wired as `liveFetchUrl`.
 */
export const TERMINAL_BENCH_OPERATOR_MIRROR_SCHEMA_DOC =
  'fixture-shaped JSON: { benchmark: "terminal_bench", source_url, scrape_date, entries: [{ model_id, score }] }';

/** Human provenance page (HTML — not a live fetch endpoint). */
export const TERMINAL_BENCH_PROVENANCE_URL = BENCHMARK_SOURCE_URLS.terminal_bench;

/** Catalog model_ids present in checked-in terminal_bench fixtures. */
const CATALOG_MODEL_IDS = [
  'claude-opus-4-5',
  'claude-sonnet-4-6',
  'gpt-5.3-codex',
  'claude-3.5-haiku',
  'gemini-2.5-flash',
] as const;

type CatalogModelId = (typeof CATALOG_MODEL_IDS)[number];

const CATALOG_SET = new Set<string>(CATALOG_MODEL_IDS);

/**
 * Display / alias tokens → catalog model_id for operator mirrors.
 * Only explicit correspondences; unknown tokens stay unmapped (kept as-is).
 */
const TERMINAL_BENCH_MODEL_TOKEN_MAP: Readonly<Record<string, CatalogModelId>> = {
  'claude-opus-4-5': 'claude-opus-4-5',
  'claude-4-5-opus': 'claude-opus-4-5',
  'claude-4.5-opus': 'claude-opus-4-5',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-sonnet-4-5': 'claude-sonnet-4-6',
  'claude-sonnet-4.5': 'claude-sonnet-4-6',
  'claude-sonnet-4': 'claude-sonnet-4-6',
  'claude-4-sonnet': 'claude-sonnet-4-6',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'gpt-5-codex': 'gpt-5.3-codex',
  'gpt-5.3': 'gpt-5.3-codex',
  'gpt-5': 'gpt-5.3-codex',
  'claude-3.5-haiku': 'claude-3.5-haiku',
  'claude-3-5-haiku': 'claude-3.5-haiku',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash': 'gemini-2.5-flash',
};

function normalizeModelToken(raw: string): string {
  let token = raw.trim().toLowerCase();
  const slash = token.lastIndexOf('/');
  if (slash >= 0) {
    token = token.slice(slash + 1);
  }
  token = token.replace(/-\d{8}(?:-\d+)?$/u, '');
  token = token.replace(/-\d{4}-\d{2}-\d{2}$/u, '');
  token = token.replace(/-\d{4}-\d{2}$/u, '');
  return token;
}

/**
 * Map a model_id / display token to a catalog id when known.
 * Returns undefined for unknown tokens (caller keeps the original id).
 */
export function mapTerminalBenchModelId(raw: string): CatalogModelId | undefined {
  const normalized = normalizeModelToken(raw);
  if (normalized.length === 0) {
    return undefined;
  }
  if (CATALOG_SET.has(normalized)) {
    return normalized as CatalogModelId;
  }
  const fromTable = TERMINAL_BENCH_MODEL_TOKEN_MAP[normalized];
  if (fromTable !== undefined) {
    return fromTable;
  }
  const fromFleet = DEFAULT_FLEET_BENCHMARK_ALIASES[normalized];
  if (fromFleet !== undefined && CATALOG_SET.has(fromFleet)) {
    return fromFleet as CatalogModelId;
  }
  for (const [alias, target] of Object.entries(DEFAULT_FLEET_BENCHMARK_ALIASES)) {
    if (normalizeModelToken(alias) === normalized && CATALOG_SET.has(target)) {
      return target as CatalogModelId;
    }
  }
  return undefined;
}

/**
 * Remap entry model_ids through the token map; keep best score per id.
 * Unmapped ids are preserved (operator may ground extra models) — scores never invented.
 */
export function normalizeTerminalBenchEntries(
  entries: readonly BenchmarkLeaderboardEntry[],
): BenchmarkLeaderboardEntry[] {
  const best = new Map<string, BenchmarkLeaderboardEntry>();
  for (const entry of entries) {
    const mapped = mapTerminalBenchModelId(entry.model_id);
    const model_id = mapped ?? entry.model_id;
    const prev = best.get(model_id);
    if (prev === undefined || entry.score > prev.score) {
      best.set(model_id, {
        model_id,
        score: entry.score,
        ...(entry.tool_call_snippet !== undefined
          ? { tool_call_snippet: entry.tool_call_snippet }
          : {}),
      });
    }
  }
  return [...best.values()].sort((a, b) => a.model_id.localeCompare(b.model_id));
}

/**
 * Parse fixture-shaped Terminal-Bench JSON (operator mirror or recorded snapshot).
 */
export function parseTerminalBenchOperatorMirror(
  raw: string,
  scrapeDate: string,
  sourceUrl: string,
): BenchmarkLeaderboardFixture {
  const fixture = parseBenchmarkLeaderboardFixture(raw, 'live:terminal_bench');
  if (fixture.benchmark !== 'terminal_bench') {
    throw new BenchmarkIngestError(
      `Terminal-Bench mirror benchmark mismatch: got ${fixture.benchmark}`,
    );
  }
  const entries = normalizeTerminalBenchEntries(fixture.entries);
  if (entries.length === 0) {
    throw new BenchmarkIngestError(
      'Terminal-Bench mirror produced no entries after model_id normalization',
    );
  }
  return {
    benchmark: 'terminal_bench',
    source_url: fixture.source_url || sourceUrl || TERMINAL_BENCH_PROVENANCE_URL,
    scrape_date: scrapeDate,
    entries,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeFixtureShaped(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const obj = JSON.parse(trimmed) as unknown;
    return isRecord(obj) && obj.benchmark === 'terminal_bench' && Array.isArray(obj.entries);
  } catch {
    return false;
  }
}

async function readLiveBody(ctx: AdapterFetchContext): Promise<string> {
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
      `Live fetch failed for terminal_bench (${url}): ${detail}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    throw new BenchmarkIngestError(
      `Live fetch HTTP ${response.status} for terminal_bench (${url})`,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new BenchmarkIngestError(
      `Live fetch body read failed for terminal_bench (${url})`,
      { cause: err },
    );
  }

  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new BenchmarkIngestError(
      `Live fetch returned empty body for terminal_bench (${url})`,
    );
  }
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
    throw new BenchmarkIngestError(
      `Live fetch for terminal_bench returned HTML, not fixture-shaped JSON (${url}). ` +
        'Point --live-url terminal_bench=URL at a JSON mirror matching ' +
        `${TERMINAL_BENCH_OPERATOR_MIRROR_SCHEMA_DOC}, or rely on recorded/fixture fallback. ` +
        'Do not use paid Parse / tbench marketplace APIs as the default live source.',
    );
  }
  return trimmed;
}

/**
 * Native Terminal-Bench adapter.
 * `liveFetchUrl` is intentionally unset — no free aggregate; operators use `--live-url`.
 */
export const terminalBenchAdapter: LeaderboardAdapter = {
  id: 'terminal_bench',
  provenanceUrl: TERMINAL_BENCH_PROVENANCE_URL,
  /** No free stable JSON endpoint; never default to paid Parse API. */
  liveFetchUrl: undefined,
  async fetchAndNormalize(ctx: AdapterFetchContext): Promise<BenchmarkLeaderboardFixture> {
    const body = await readLiveBody(ctx);

    if (!looksLikeFixtureShaped(body)) {
      throw new BenchmarkIngestError(
        `Live fetch for terminal_bench is not fixture-shaped JSON (${ctx.url}). ` +
          `Expected ${TERMINAL_BENCH_OPERATOR_MIRROR_SCHEMA_DOC}. ` +
          'Paid Parse API is not supported as the default live source.',
      );
    }

    return parseTerminalBenchOperatorMirror(body, ctx.scrapeDate, ctx.url);
  },
};
