import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';

export interface ScopedModel {
  model: Model<Api>;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

type ResolveModelScopeFn = (
  patterns: string[],
  modelRegistry: ModelRegistry,
) => Promise<ScopedModel[]>;

function findPiCodingAgentDir(): string {
  const candidates: string[] = [];
  const roots = [dirname(fileURLToPath(import.meta.url)), process.cwd()];

  for (const start of roots) {
    let dir = start;
    for (let i = 0; i < 12; i++) {
      candidates.push(join(dir, 'node_modules/@earendil-works/pi-coding-agent'));
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'dist/core/model-resolver.js'))) {
      return candidate;
    }
  }

  throw new Error('Unable to locate @earendil-works/pi-coding-agent for resolveModelScope');
}

const piPkgDir = findPiCodingAgentDir();
const modelResolver = await import(
  pathToFileURL(join(piPkgDir, 'dist/core/model-resolver.js')).href
);
const piResolveModelScope = modelResolver.resolveModelScope as ResolveModelScopeFn;

/** Delegate to pi's resolveModelScope (not yet on the public package export surface). */
export function resolveModelScope(
  patterns: string[],
  modelRegistry: ModelRegistry,
): Promise<ScopedModel[]> {
  return piResolveModelScope(patterns, modelRegistry);
}
