/**
 * Peak/off-peak pricing adapters — SP-243, #165.
 *
 * Pre-route schedule path for the two vendors with documented peak vs
 * off-peak rate cards:
 *
 * - **Z.ai GLM Coding Plan** — peak Mon–Fri 14:00–18:00 Asia/Singapore
 *   (UTC+8); weekends off-peak all day. Default plan-profile `credits`:
 *   off-peak model usage at 0.5× the standard credit rate. Legacy plans
 *   (e.g. GLM-5.3 1× off-peak / 3× peak, Flash 0.4× / 1.2×) share the same
 *   window but use different multipliers — available ONLY via an explicit
 *   operator override (`config.zai`); the adapter never scrapes the live
 *   account plan.
 * - **DeepSeek pay-as-you-go API** — peak 01:00–04:00 and 06:00–10:00 UTC
 *   Monday–Friday; all other hours (and weekends) off-peak at half the peak
 *   rate on cache-hit input, cache-miss input, and output.
 *
 * All functions are pure with an injectable `now` for frozen-clock tests.
 * Non-target providers (OpenAI / Anthropic / Gemini / local / unknown) return
 * `window: 'none'` with multiplier 1 — no invented clocks, fail open.
 */

/** Telemetry / estimate pricing window classification (SP-243, #165). */
export type PricingWindow = 'peak' | 'off_peak' | 'none';

/** Result of consulting the peak-pricing adapters for one model. */
export interface PeakPricingAdjustment {
  readonly window: PricingWindow;
  /** Multiplier applied to the resolved cost_per_1m (1 = unchanged). */
  readonly cost_multiplier: number;
  /** Which adapter matched, for diagnostics; null when no adapter applies. */
  readonly adapter_id: 'zai' | 'deepseek' | null;
}

/** Operator overrides for the Z.ai adapter. All fields optional. */
export interface ZaiPeakPricingConfig {
  /**
   * Plan profile. Default `credits` (off-peak 0.5× standard, peak 1×).
   * `legacy` uses the multipliers below — documented legacy rates must be
   * supplied explicitly; there is no live account-plan detection.
   */
  readonly plan_profile?: 'credits' | 'legacy';
  /** Legacy-only peak multiplier (e.g. 3 for GLM-5.3 legacy). */
  readonly peak_multiplier?: number;
  /** Legacy-only off-peak multiplier (e.g. 1 for GLM-5.3 legacy). */
  readonly off_peak_multiplier?: number;
}

/** Operator overrides for the DeepSeek adapter. */
export interface DeepSeekPeakPricingConfig {
  /** Off-peak multiplier relative to peak (documented: 0.5). */
  readonly off_peak_multiplier?: number;
}

/** Peak-pricing adapter configuration. Adapters are on by default. */
export interface PeakPricingConfig {
  /** Master switch; false disables all adapters (fail open to flat rates). */
  readonly enabled?: boolean;
  readonly zai?: ZaiPeakPricingConfig;
  readonly deepseek?: DeepSeekPeakPricingConfig;
}

/** Injectable clock + config for peak-pricing resolution. */
export interface PeakPricingOptions {
  /** Evaluation instant; defaults to the current time. */
  readonly now?: Date;
  readonly config?: PeakPricingConfig;
}

/** Model shape needed for adapter matching (satisfied by ModelProfile). */
export interface PeakPricingModelRef {
  readonly id: string;
  readonly provider?: string;
}

/** Z.ai credits plan (default): off-peak usage at half the standard rate. */
export const ZAI_CREDITS_OFF_PEAK_MULTIPLIER = 0.5;
export const ZAI_CREDITS_PEAK_MULTIPLIER = 1.0;
/** DeepSeek documented off-peak discount: half of peak on all token kinds. */
export const DEEPSEEK_OFF_PEAK_MULTIPLIER = 0.5;

/** Asia/Singapore has no DST — a fixed UTC+8 offset is exact. */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

const NO_ADJUSTMENT: PeakPricingAdjustment = {
  window: 'none',
  cost_multiplier: 1,
  adapter_id: null,
};

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizeProviderKey(provider: string | undefined): string {
  return (provider ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True for pi fleet ids/providers on the Z.ai GLM family (zai / z.ai / glm / zhipu). */
export function matchesZaiAdapter(model: PeakPricingModelRef): boolean {
  const provider = normalizeProviderKey(model.provider);
  if (
    provider.includes('zai') ||
    provider.includes('glm') ||
    provider.includes('zhipu')
  ) {
    return true;
  }
  return /(^|[^a-z])glm[-_.]?\d/i.test(model.id) || /^glm/i.test(model.id);
}

/** True for pi fleet ids/providers on the DeepSeek API family. */
export function matchesDeepSeekAdapter(model: PeakPricingModelRef): boolean {
  const provider = normalizeProviderKey(model.provider);
  if (provider.includes('deepseek')) {
    return true;
  }
  return /deepseek/i.test(model.id);
}

function isWeekday(day: number): boolean {
  return day >= 1 && day <= 5;
}

/**
 * Z.ai window in Asia/Singapore (fixed UTC+8): peak Mon–Fri 14:00 ≤ t < 18:00;
 * weekends and all other hours off-peak.
 */
export function resolveZaiWindow(now: Date): Exclude<PricingWindow, 'none'> {
  const sgt = new Date(now.getTime() + SGT_OFFSET_MS);
  const day = sgt.getUTCDay();
  const hour = sgt.getUTCHours();
  if (isWeekday(day) && hour >= 14 && hour < 18) {
    return 'peak';
  }
  return 'off_peak';
}

/**
 * DeepSeek window in UTC: peak Mon–Fri 01:00–04:00 and 06:00–10:00;
 * all other hours and weekends off-peak.
 */
export function resolveDeepSeekWindow(now: Date): Exclude<PricingWindow, 'none'> {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (isWeekday(day) && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10))) {
    return 'peak';
  }
  return 'off_peak';
}

function isUsableMultiplier(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function zaiMultipliers(
  config: ZaiPeakPricingConfig | undefined,
): { peak: number; offPeak: number } {
  if (config?.plan_profile === 'legacy') {
    // Legacy multipliers exist only as documented operator overrides; a
    // missing leg defaults to 1 (no bias) rather than inventing a rate.
    return {
      peak: isUsableMultiplier(config.peak_multiplier)
        ? config.peak_multiplier
        : 1,
      offPeak: isUsableMultiplier(config.off_peak_multiplier)
        ? config.off_peak_multiplier
        : 1,
    };
  }
  return {
    peak: ZAI_CREDITS_PEAK_MULTIPLIER,
    offPeak: ZAI_CREDITS_OFF_PEAK_MULTIPLIER,
  };
}

/**
 * Resolve the peak/off-peak adjustment for a fleet model.
 *
 * Fail open: disabled config, invalid clock, or a non-target provider yields
 * `window: 'none'` with multiplier 1 so flat-rate behavior is unchanged.
 */
export function resolvePeakPricingAdjustment(
  model: PeakPricingModelRef,
  options?: PeakPricingOptions,
): PeakPricingAdjustment {
  const config = options?.config;
  if (config?.enabled === false) {
    return NO_ADJUSTMENT;
  }

  const now = options?.now ?? new Date();
  if (!isValidDate(now)) {
    return NO_ADJUSTMENT;
  }

  if (matchesZaiAdapter(model)) {
    const window = resolveZaiWindow(now);
    const { peak, offPeak } = zaiMultipliers(config?.zai);
    return {
      window,
      cost_multiplier: window === 'peak' ? peak : offPeak,
      adapter_id: 'zai',
    };
  }

  if (matchesDeepSeekAdapter(model)) {
    const window = resolveDeepSeekWindow(now);
    const offPeak = isUsableMultiplier(config?.deepseek?.off_peak_multiplier)
      ? config.deepseek.off_peak_multiplier
      : DEEPSEEK_OFF_PEAK_MULTIPLIER;
    return {
      window,
      cost_multiplier: window === 'peak' ? 1 : offPeak,
      adapter_id: 'deepseek',
    };
  }

  return NO_ADJUSTMENT;
}
