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
