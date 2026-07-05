import { DEFAULT_OPERATOR_CONFIG } from '../../../src/config/defaults.js';
import type { PriceCatalog } from '../../../src/domain/types/index.js';
import { fetchLitellmPriceCatalog } from '../../../src/infrastructure/pricing/litellm-fetch.js';
import { checkStaleness } from '../../../src/infrastructure/pricing/pricing-monitor.js';
import type { SmartRouterRuntime } from './types.js';

export async function refreshPricingCatalog(
  runtime: SmartRouterRuntime,
  fetchFn?: typeof fetch,
): Promise<{ modelCount: number; lastUpdated: string }> {
  const existing = await runtime.store.getPriceCatalog();
  const { catalog: fetched, model_count: modelCount } = await fetchLitellmPriceCatalog(
    fetchFn ? { fetchFn } : {},
  );

  const catalog: PriceCatalog = {
    ...fetched,
    user_overrides: existing?.user_overrides ?? {},
  };

  await runtime.store.putPriceCatalog(catalog);
  runtime.priceCatalog = catalog;

  return { modelCount, lastUpdated: catalog.last_updated };
}

export function formatPricingStalenessLine(catalog: PriceCatalog | null): string | undefined {
  const staleness = checkStaleness(
    catalog,
    DEFAULT_OPERATOR_CONFIG.pricing.staleness_days,
  );
  return staleness.warning;
}

export function notifyPricingStalenessIfNeeded(
  runtime: SmartRouterRuntime,
  notify: (message: string, level: 'info' | 'warning' | 'error') => void,
): void {
  const stalenessLine = formatPricingStalenessLine(runtime.priceCatalog);
  if (stalenessLine) {
    notify(stalenessLine, 'warning');
  }
}
