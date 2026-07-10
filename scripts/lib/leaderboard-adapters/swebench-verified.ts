/**
 * SWE-bench Verified native live adapter — SP-182 / GitHub #104.
 *
 * Parses leaderboards.json (Verified board), maps Model tags / names to catalog
 * model_ids, uses `resolved` as score (0–100). Unmapped and multi-model rows
 * are skipped — scores are never invented.
 *
 * Also accepts fixture-shaped JSON for `--live-url` mirrors (SP-181 compat).
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

/** Machine-readable SWE-bench leaderboards payload (Verified board). */
export const SWEBENCH_VERIFIED_LIVE_FETCH_URL =
  'https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json';

const VERIFIED_BOARD_NAME = 'Verified';

/** Catalog model_ids present in checked-in swebench_verified fixtures. */
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
 * SWE-bench tag / display-name tokens → catalog model_id.
 * Only explicit correspondences; unknown tokens stay unmapped.
 */
const SWEBENCH_MODEL_TOKEN_MAP: Readonly<Record<string, CatalogModelId>> = {
  // Opus 4.5 family
  'claude-opus-4-5': 'claude-opus-4-5',
  'claude-4-5-opus': 'claude-opus-4-5',
  'claude-4.5-opus': 'claude-opus-4-5',
  // Sonnet → fixture row claude-sonnet-4-6 (fleet alias spirit)
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-sonnet-4-5': 'claude-sonnet-4-6',
  'claude-sonnet-4.5': 'claude-sonnet-4-6',
  'claude-sonnet-4': 'claude-sonnet-4-6',
  'claude-4-sonnet': 'claude-sonnet-4-6',
  'claude-4.5-sonnet': 'claude-sonnet-4-6',
  'claude-3-5-sonnet': 'claude-sonnet-4-6',
  'claude-3.5-sonnet': 'claude-sonnet-4-6',
  // GPT-5 coding family → gpt-5.3-codex
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'gpt-5-codex': 'gpt-5.3-codex',
  'gpt-5.1-codex': 'gpt-5.3-codex',
  'gpt-5-2-codex': 'gpt-5.3-codex',
  'gpt-5.2-codex': 'gpt-5.3-codex',
  'gpt-5': 'gpt-5.3-codex',
  'gpt-5.1': 'gpt-5.3-codex',
  'gpt-5.2': 'gpt-5.3-codex',
  'gpt-5.3': 'gpt-5.3-codex',
  // Haiku 3.5 only (not haiku-4-5 / claude-3-haiku)
  'claude-3.5-haiku': 'claude-3.5-haiku',
  'claude-3-5-haiku': 'claude-3.5-haiku',
  // Gemini 2.5 flash (+ 2.0 flash alias)
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash': 'gemini-2.5-flash',
};

interface SwebenchLeaderboardResult {
  readonly name?: unknown;
  readonly resolved?: unknown;
  readonly tags?: unknown;
}

interface SwebenchLeaderboardBoard {
  readonly name?: unknown;
  readonly results?: unknown;
}

interface SwebenchLeaderboardsPayload {
  readonly leaderboards?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeModelToken(raw: string): string {
  let token = raw.trim().toLowerCase();
  // Strip provider prefixes (openai/gpt-5-…)
  const slash = token.lastIndexOf('/');
  if (slash >= 0) {
    token = token.slice(slash + 1);
  }
  // Strip date / build suffixes: -20251101, -2025-08-07, -0807-global
  token = token.replace(/-\d{8}(?:-\d+)?$/u, '');
  token = token.replace(/-\d{4}-\d{2}-\d{2}$/u, '');
  token = token.replace(/-\d{4}-\d{2}$/u, '');
  return token;
}

/**
 * Map a single model token (from a Model: tag or name fragment) to a catalog id.
 */
export function mapSwebenchModelToken(raw: string): CatalogModelId | undefined {
  const normalized = normalizeModelToken(raw);
  if (normalized.length === 0) {
    return undefined;
  }
  if (CATALOG_SET.has(normalized)) {
    return normalized as CatalogModelId;
  }
  const fromTable = SWEBENCH_MODEL_TOKEN_MAP[normalized];
  if (fromTable !== undefined) {
    return fromTable;
  }
  const fromFleet = DEFAULT_FLEET_BENCHMARK_ALIASES[normalized];
  if (fromFleet !== undefined && CATALOG_SET.has(fromFleet)) {
    return fromFleet as CatalogModelId;
  }
  // Dated / variant keys already in fleet map under slightly different forms
  for (const [alias, target] of Object.entries(DEFAULT_FLEET_BENCHMARK_ALIASES)) {
    if (normalizeModelToken(alias) === normalized && CATALOG_SET.has(target)) {
      return target as CatalogModelId;
    }
  }
  return undefined;
}

function extractModelTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const models: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const match = /^\s*model\s*:\s*(.+)$/iu.exec(tag);
    if (match?.[1]) {
      models.push(match[1].trim());
    }
  }
  return models;
}

/**
 * Resolve a Verified result to at most one catalog model_id.
 * Multi-model rows that map to distinct catalog ids are skipped.
 */
export function resolveSwebenchResultModelId(
  result: SwebenchLeaderboardResult,
): CatalogModelId | undefined {
  const tagModels = extractModelTags(result.tags);
  const mappedFromTags = new Set<CatalogModelId>();
  for (const token of tagModels) {
    const id = mapSwebenchModelToken(token);
    if (id !== undefined) {
      mappedFromTags.add(id);
    }
  }
  if (mappedFromTags.size === 1) {
    return [...mappedFromTags][0];
  }
  if (mappedFromTags.size > 1) {
    return undefined;
  }

  // No usable Model tags — try display name heuristics (single-model names only).
  if (typeof result.name !== 'string' || result.name.trim().length === 0) {
    return undefined;
  }
  const name = result.name;
  // Prefer explicit catalog / token substrings in the name.
  const nameCandidates: Array<{ index: number; id: CatalogModelId }> = [];
  const probeTokens = [
    ...Object.keys(SWEBENCH_MODEL_TOKEN_MAP),
    ...CATALOG_MODEL_IDS,
  ];
  const lower = name.toLowerCase();
  for (const token of probeTokens) {
    const idx = lower.indexOf(token.toLowerCase());
    if (idx >= 0) {
      const id = mapSwebenchModelToken(token);
      if (id !== undefined) {
        nameCandidates.push({ index: idx, id });
      }
    }
  }
  const unique = new Set(nameCandidates.map((c) => c.id));
  if (unique.size === 1) {
    return [...unique][0];
  }
  return undefined;
}

function parseResolvedScore(resolved: unknown): number | undefined {
  if (typeof resolved === 'number' && Number.isFinite(resolved)) {
    return resolved;
  }
  if (typeof resolved === 'string' && resolved.trim().length > 0) {
    const n = Number(resolved);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Convert Verified board results into fixture entries.
 * Keeps the best `resolved` score per mapped model_id; skips unmapped rows.
 */
export function verifiedResultsToEntries(
  results: readonly SwebenchLeaderboardResult[],
): BenchmarkLeaderboardEntry[] {
  const best = new Map<CatalogModelId, number>();
  for (const result of results) {
    const modelId = resolveSwebenchResultModelId(result);
    if (modelId === undefined) continue;
    const score = parseResolvedScore(result.resolved);
    if (score === undefined) continue;
    const prev = best.get(modelId);
    if (prev === undefined || score > prev) {
      best.set(modelId, score);
    }
  }
  return [...best.entries()]
    .map(([model_id, score]) => ({ model_id, score }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

/**
 * Parse leaderboards.json and extract the Verified board as a fixture snapshot.
 */
export function parseSwebenchVerifiedLeaderboards(
  raw: string,
  scrapeDate: string,
  sourceUrl: string,
): BenchmarkLeaderboardFixture {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new BenchmarkIngestError('SWE-bench leaderboards.json is not valid JSON', {
      cause: err,
    });
  }

  if (!isRecord(parsed)) {
    throw new BenchmarkIngestError('SWE-bench leaderboards.json root must be an object');
  }

  const payload = parsed as SwebenchLeaderboardsPayload;
  if (!Array.isArray(payload.leaderboards)) {
    throw new BenchmarkIngestError('SWE-bench leaderboards.json missing leaderboards[]');
  }

  const verified = payload.leaderboards.find((board): board is SwebenchLeaderboardBoard => {
    return isRecord(board) && board.name === VERIFIED_BOARD_NAME;
  });
  if (verified === undefined) {
    throw new BenchmarkIngestError(
      `SWE-bench leaderboards.json has no board named "${VERIFIED_BOARD_NAME}"`,
    );
  }
  if (!Array.isArray(verified.results)) {
    throw new BenchmarkIngestError('SWE-bench Verified board missing results[]');
  }

  const entries = verifiedResultsToEntries(verified.results as SwebenchLeaderboardResult[]);
  if (entries.length === 0) {
    throw new BenchmarkIngestError(
      'SWE-bench Verified board produced no catalog-mapped entries (all rows skipped)',
    );
  }

  return {
    benchmark: 'swebench_verified',
    source_url: sourceUrl,
    scrape_date: scrapeDate,
    entries,
  };
}

function looksLikeFixtureShaped(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const obj = JSON.parse(trimmed) as unknown;
    return isRecord(obj) && obj.benchmark === 'swebench_verified' && Array.isArray(obj.entries);
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
      `Live fetch failed for swebench_verified (${url}): ${detail}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    throw new BenchmarkIngestError(
      `Live fetch HTTP ${response.status} for swebench_verified (${url})`,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new BenchmarkIngestError(
      `Live fetch body read failed for swebench_verified (${url})`,
      { cause: err },
    );
  }

  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new BenchmarkIngestError(
      `Live fetch returned empty body for swebench_verified (${url})`,
    );
  }
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
    throw new BenchmarkIngestError(
      `Live fetch for swebench_verified returned HTML, not JSON (${url})`,
    );
  }
  return trimmed;
}

export const swebenchVerifiedAdapter: LeaderboardAdapter = {
  id: 'swebench_verified',
  provenanceUrl: BENCHMARK_SOURCE_URLS.swebench_verified,
  liveFetchUrl: SWEBENCH_VERIFIED_LIVE_FETCH_URL,
  async fetchAndNormalize(ctx: AdapterFetchContext): Promise<BenchmarkLeaderboardFixture> {
    const body = await readLiveBody(ctx);

    if (looksLikeFixtureShaped(body)) {
      const fixture = parseBenchmarkLeaderboardFixture(body, 'live:swebench_verified');
      if (fixture.benchmark !== 'swebench_verified') {
        throw new BenchmarkIngestError(
          `Live snapshot benchmark mismatch for swebench_verified: got ${fixture.benchmark}`,
        );
      }
      return {
        ...fixture,
        source_url: fixture.source_url || BENCHMARK_SOURCE_URLS.swebench_verified || ctx.url,
        scrape_date: ctx.scrapeDate,
      };
    }

    return parseSwebenchVerifiedLeaderboards(
      body,
      ctx.scrapeDate,
      SWEBENCH_VERIFIED_LIVE_FETCH_URL,
    );
  },
};
