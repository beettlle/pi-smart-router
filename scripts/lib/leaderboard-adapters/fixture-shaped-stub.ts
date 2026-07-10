/**
 * Shared fixture-shaped stub adapter — SP-181.
 *
 * Expects JSON matching the checked-in leaderboard fixture schema.
 * Native parsers (SP-182–SP-185) replace these stubs per benchmark.
 */

import {
  BenchmarkIngestError,
  parseBenchmarkLeaderboardFixture,
  type BenchmarkId,
  type BenchmarkLeaderboardFixture,
} from '../../ingest-benchmark-profiles.js';

import type { AdapterFetchContext, LeaderboardAdapter } from './types.js';

export interface FixtureShapedStubOptions {
  readonly id: BenchmarkId;
  readonly provenanceUrl: string;
  /** Unset until native adapter (override-only live path). */
  readonly liveFetchUrl?: string;
}

/**
 * Build a stub adapter that fetches + parses fixture-shaped JSON only.
 * Rejects HTML and empty bodies; never invents scores.
 */
export function createFixtureShapedStubAdapter(
  options: FixtureShapedStubOptions,
): LeaderboardAdapter {
  const { id, provenanceUrl, liveFetchUrl } = options;

  return {
    id,
    provenanceUrl,
    liveFetchUrl,
    async fetchAndNormalize(ctx: AdapterFetchContext): Promise<BenchmarkLeaderboardFixture> {
      const { url, fetchFn, scrapeDate, signal, timeoutMs } = ctx;

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
          `Live fetch failed for ${id} (${url}): ${detail}`,
          { cause: err },
        );
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onOuterAbort);
      }

      if (!response.ok) {
        throw new BenchmarkIngestError(`Live fetch HTTP ${response.status} for ${id} (${url})`);
      }

      let body: string;
      try {
        body = await response.text();
      } catch (err) {
        throw new BenchmarkIngestError(`Live fetch body read failed for ${id} (${url})`, {
          cause: err,
        });
      }

      const trimmed = body.trim();
      if (trimmed.length === 0) {
        throw new BenchmarkIngestError(`Live fetch returned empty body for ${id} (${url})`);
      }
      if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
        throw new BenchmarkIngestError(
          `Live fetch for ${id} returned HTML, not fixture-shaped JSON (${url}). ` +
            'Point --live-url at a JSON mirror matching the leaderboard fixture schema, ' +
            'or place recorded snapshots under --record-dir / --recorded.',
        );
      }

      const fixture = parseBenchmarkLeaderboardFixture(trimmed, `live:${id}`);
      if (fixture.benchmark !== id) {
        throw new BenchmarkIngestError(
          `Live snapshot benchmark mismatch for ${id}: got ${fixture.benchmark}`,
        );
      }

      return {
        ...fixture,
        source_url: fixture.source_url || provenanceUrl || url,
        scrape_date: scrapeDate,
      };
    },
  };
}
