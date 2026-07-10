import { join } from 'node:path';

import {
  createResilientStore,
  SqliteStore,
  SqliteStoreError,
} from '../../../src/infrastructure/persistence/sqlite-store.js';
import type { StorePort } from '../../../src/domain/types/store-port.js';
import type { RateLimitPort } from '../../../src/infrastructure/gateway/gateway-dispatch.js';

export const DEFAULT_ROUTER_STATE_DB_PATH = '.pi-smart-router/state.db';
export const DEFAULT_RATE_LIMIT_MAX_TOKENS = 60;
export const DEFAULT_RATE_LIMIT_REFILL_RATE = 1;

export function getRouterStateDbPath(cwd: string): string {
  const configured = process.env.ROUTER_STATE_DB_PATH?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return join(cwd, DEFAULT_ROUTER_STATE_DB_PATH);
}

export function createExtensionStore(cwd: string): StorePort {
  return createResilientStore({
    dbPath: getRouterStateDbPath(cwd),
    models: [],
  }).store;
}

export function createSqliteRateLimiter(sqliteStore: SqliteStore): RateLimitPort {
  return {
    consumeToken(key: string, cost = 1) {
      try {
        return sqliteStore.consumeToken(key, cost);
      } catch (error) {
        if (
          error instanceof SqliteStoreError &&
          error.message.includes('Token bucket not found')
        ) {
          sqliteStore.initBucket(
            key,
            DEFAULT_RATE_LIMIT_MAX_TOKENS,
            DEFAULT_RATE_LIMIT_REFILL_RATE,
          );
          return sqliteStore.consumeToken(key, cost);
        }
        throw error;
      }
    },
  };
}

export function resolveRateLimiter(store: StorePort): RateLimitPort | undefined {
  if (!(store instanceof SqliteStore)) {
    return undefined;
  }
  return createSqliteRateLimiter(store);
}

/** True when the request was aborted via AbortSignal or an abort-shaped error. */
export function isAbortError(
  error: unknown,
  options?: { signal?: AbortSignal },
): boolean {
  if (options?.signal?.aborted) {
    return true;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return true;
    }
    if (error.message === 'Request was aborted') {
      return true;
    }
  }
  return false;
}

/** Throw if `options.signal` is already aborted. */
export function throwIfAborted(options?: { signal?: AbortSignal }): void {
  if (options?.signal?.aborted) {
    throw new Error('Request was aborted');
  }
}
