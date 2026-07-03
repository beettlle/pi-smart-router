import { describe, expect, it } from 'vitest';

import { checkStaleness } from '../../src/infrastructure/pricing/pricing-monitor.js';
import type { PriceCatalog } from '../../src/domain/types/index.js';

function makeCatalog(lastUpdated: string): PriceCatalog {
  return {
    registry_snapshot: { 'model-a': 1.0 },
    user_overrides: {},
    last_updated: lastUpdated,
    source: 'registry',
  };
}

function daysAgo(days: number, from: Date = new Date('2026-07-01T00:00:00Z')): string {
  const d = new Date(from.getTime() - days * 86_400_000);
  return d.toISOString();
}

const REF_NOW = new Date('2026-07-01T00:00:00Z');

// ─── checkStaleness ──────────────────────────────────────────────────────────

describe('checkStaleness (FR-020)', () => {
  it('reports stale when catalog is null', () => {
    const result = checkStaleness(null);
    expect(result.stale).toBe(true);
    expect(result.age_days).toBe(Infinity);
    expect(result.warning).toContain('No pricing catalog loaded');
  });

  it('reports fresh when catalog is within threshold', () => {
    const catalog = makeCatalog(daysAgo(5, REF_NOW));
    const result = checkStaleness(catalog, 14, REF_NOW);

    expect(result.stale).toBe(false);
    expect(result.age_days).toBe(5);
    expect(result.warning).toBeUndefined();
  });

  it('reports stale when catalog exceeds 14-day default threshold', () => {
    const catalog = makeCatalog(daysAgo(15, REF_NOW));
    const result = checkStaleness(catalog, 14, REF_NOW);

    expect(result.stale).toBe(true);
    expect(result.age_days).toBe(15);
    expect(result.warning).toContain('15 days old');
    expect(result.warning).toContain('threshold: 14 days');
  });

  it('respects operator-configured staleness threshold', () => {
    const catalog = makeCatalog(daysAgo(8, REF_NOW));

    const fresh = checkStaleness(catalog, 10, REF_NOW);
    expect(fresh.stale).toBe(false);

    const stale = checkStaleness(catalog, 7, REF_NOW);
    expect(stale.stale).toBe(true);
    expect(stale.threshold_days).toBe(7);
  });

  it('catalog updated exactly at threshold is not stale (boundary)', () => {
    const catalog = makeCatalog(daysAgo(14, REF_NOW));
    const result = checkStaleness(catalog, 14, REF_NOW);
    expect(result.stale).toBe(false);
    expect(result.age_days).toBe(14);
  });

  it('catalog just past threshold is stale', () => {
    const almostStale = new Date(REF_NOW.getTime() - 14.1 * 86_400_000);
    const catalog = makeCatalog(almostStale.toISOString());
    const result = checkStaleness(catalog, 14, REF_NOW);
    expect(result.stale).toBe(true);
  });

  it('freshly updated catalog (0 days) is not stale', () => {
    const catalog = makeCatalog(REF_NOW.toISOString());
    const result = checkStaleness(catalog, 14, REF_NOW);

    expect(result.stale).toBe(false);
    expect(result.age_days).toBe(0);
  });

  it('warning message includes actionable refresh suggestion', () => {
    const catalog = makeCatalog(daysAgo(30, REF_NOW));
    const result = checkStaleness(catalog, 14, REF_NOW);

    expect(result.warning).toContain('refreshing registry rates');
  });

  it('returns threshold_days in result for caller visibility', () => {
    const catalog = makeCatalog(daysAgo(1, REF_NOW));
    const result = checkStaleness(catalog, 7, REF_NOW);

    expect(result.threshold_days).toBe(7);
  });

  it('defaults to 14-day threshold when not specified', () => {
    const catalog = makeCatalog(daysAgo(13, REF_NOW));
    const result = checkStaleness(catalog, undefined, REF_NOW);
    expect(result.stale).toBe(false);
    expect(result.threshold_days).toBe(14);
  });
});
