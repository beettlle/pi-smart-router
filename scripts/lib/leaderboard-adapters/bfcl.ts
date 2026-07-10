/**
 * BFCL native CSV live adapter — SP-184 / GitHub #104.
 *
 * Parses Gorilla `data_overall.csv` (Overall Acc → score). Maps Model column
 * strings to catalog `model_id`s; skips unmapped rows; never invents scores.
 */

import {
  BENCHMARK_SOURCE_URLS,
  BenchmarkIngestError,
  type BenchmarkLeaderboardEntry,
  type BenchmarkLeaderboardFixture,
} from '../../ingest-benchmark-profiles.js';

import type { AdapterFetchContext, LeaderboardAdapter } from './types.js';

/** Default machine-readable BFCL overall leaderboard (Gorilla gh-pages). */
export const BFCL_LIVE_FETCH_URL =
  'https://raw.githubusercontent.com/ShishirPatil/gorilla/gh-pages/data_overall.csv';

/**
 * Catalog model_ids accepted as ingest targets (fixture / alias destinations).
 * Unmapped leaderboard rows are skipped — never invent scores.
 */
export const BFCL_CATALOG_MODEL_IDS = [
  'claude-opus-4-5',
  'claude-sonnet-4-6',
  'claude-3.5-haiku',
  'gemini-2.5-flash',
  'gpt-5.3-codex',
] as const;

/**
 * Explicit BFCL Model-column stems (after stripping FC/Prompt) → catalog id.
 * Prefer exact / family matches over inventing scores for unknown models.
 */
const BFCL_MODEL_STEM_TO_CATALOG: Readonly<Record<string, string>> = {
  'claude-opus-4-5': 'claude-opus-4-5',
  'claude-opus-4': 'claude-opus-4-5',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-sonnet-4-5': 'claude-sonnet-4-6',
  'claude-sonnet-4': 'claude-sonnet-4-6',
  'claude-3.5-haiku': 'claude-3.5-haiku',
  'claude-3-5-haiku': 'claude-3.5-haiku',
  'claude-haiku-3.5': 'claude-3.5-haiku',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'gpt-5-codex': 'gpt-5.3-codex',
  'gpt-5.3': 'gpt-5.3-codex',
};

const CATALOG_SET = new Set<string>(BFCL_CATALOG_MODEL_IDS);

/** Strip `(FC)` / `(Prompt)` / thinking variants from BFCL Model names. */
export function stripBfclModeSuffix(model: string): string {
  return model
    .replace(
      /\s*\((?:FC(?:\s+thinking)?|Prompt(?:\s*\+\s*Thinking)?)\)\s*$/i,
      '',
    )
    .trim();
}

/** Normalize a BFCL model label toward catalog kebab-case ids. */
export function normalizeBfclModelStem(raw: string): string {
  const stripped = stripBfclModeSuffix(raw);
  return stripped
    .toLowerCase()
    .replace(/_/g, '-')
    // Drop trailing ISO-ish date stamps: -20251101
    .replace(/-\d{8}$/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Map a BFCL Model column value to a catalog `model_id`, or `undefined` to skip.
 */
export function mapBfclModelToCatalogId(rawModel: string): string | undefined {
  const stem = normalizeBfclModelStem(rawModel);
  if (stem.length === 0) {
    return undefined;
  }

  const explicit = BFCL_MODEL_STEM_TO_CATALOG[stem];
  if (explicit !== undefined) {
    return explicit;
  }

  if (CATALOG_SET.has(stem)) {
    return stem;
  }

  return undefined;
}

/** Parse Overall Acc cell (`77.47%` or `77.47`) → finite number; else undefined. */
export function parseOverallAcc(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.toUpperCase() === 'N/A') {
    return undefined;
  }
  const withoutPct = trimmed.endsWith('%') ? trimmed.slice(0, -1).trim() : trimmed;
  const value = Number(withoutPct);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

/**
 * Minimal CSV line splitter — handles quoted fields with commas.
 * Sufficient for Gorilla `data_overall.csv` (no multiline fields).
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

export interface ParseBfclCsvOptions {
  readonly scrapeDate: string;
  /** Provenance / source_url stamped on the fixture. */
  readonly sourceUrl?: string;
}

/**
 * Parse BFCL `data_overall.csv` text into a fixture-shaped snapshot.
 * Uses Overall Acc only; skips unmapped models; keeps max score per model_id.
 */
export function parseBfclOverallCsv(
  csvText: string,
  options: ParseBfclCsvOptions,
): BenchmarkLeaderboardFixture {
  const trimmed = csvText.trim();
  if (trimmed.length === 0) {
    throw new BenchmarkIngestError('BFCL CSV is empty');
  }
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
    throw new BenchmarkIngestError('BFCL live fetch returned HTML, not CSV');
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new BenchmarkIngestError('BFCL CSV has no data rows');
  }

  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  const overallIdx = header.findIndex((h) => h.toLowerCase() === 'overall acc');
  const modelIdx = header.findIndex((h) => h.toLowerCase() === 'model');
  if (overallIdx < 0 || modelIdx < 0) {
    throw new BenchmarkIngestError(
      `BFCL CSV missing required columns (Overall Acc, Model); got: ${header.join(',')}`,
    );
  }

  const bestByModel = new Map<string, number>();

  for (let rowNum = 1; rowNum < lines.length; rowNum += 1) {
    const cols = splitCsvLine(lines[rowNum]!);
    const modelRaw = (cols[modelIdx] ?? '').trim();
    const accRaw = (cols[overallIdx] ?? '').trim();
    if (modelRaw.length === 0) {
      continue;
    }

    const modelId = mapBfclModelToCatalogId(modelRaw);
    if (modelId === undefined) {
      continue;
    }

    const score = parseOverallAcc(accRaw);
    if (score === undefined) {
      continue;
    }

    const prev = bestByModel.get(modelId);
    if (prev === undefined || score > prev) {
      bestByModel.set(modelId, score);
    }
  }

  if (bestByModel.size === 0) {
    throw new BenchmarkIngestError(
      'BFCL CSV produced zero mapped entries (no catalog model_id matches)',
    );
  }

  const entries: BenchmarkLeaderboardEntry[] = [...bestByModel.entries()]
    .map(([model_id, score]) => ({ model_id, score }))
    .sort((a, b) => b.score - a.score || a.model_id.localeCompare(b.model_id));

  return {
    benchmark: 'bfcl',
    source_url: options.sourceUrl ?? BENCHMARK_SOURCE_URLS.bfcl,
    scrape_date: options.scrapeDate,
    entries,
  };
}

async function fetchCsvBody(ctx: AdapterFetchContext): Promise<string> {
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
      headers: { Accept: 'text/csv, text/plain;q=0.9, */*;q=0.8' },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new BenchmarkIngestError(`Live fetch failed for bfcl (${url}): ${detail}`, {
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    throw new BenchmarkIngestError(`Live fetch HTTP ${response.status} for bfcl (${url})`);
  }

  try {
    return await response.text();
  } catch (err) {
    throw new BenchmarkIngestError(`Live fetch body read failed for bfcl (${url})`, {
      cause: err,
    });
  }
}

export const bfclAdapter: LeaderboardAdapter = {
  id: 'bfcl',
  provenanceUrl: BENCHMARK_SOURCE_URLS.bfcl,
  liveFetchUrl: BFCL_LIVE_FETCH_URL,
  async fetchAndNormalize(ctx: AdapterFetchContext): Promise<BenchmarkLeaderboardFixture> {
    const body = await fetchCsvBody(ctx);
    return parseBfclOverallCsv(body, {
      scrapeDate: ctx.scrapeDate,
      sourceUrl: BENCHMARK_SOURCE_URLS.bfcl,
    });
  },
};
