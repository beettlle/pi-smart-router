import { execSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
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

const PI_CODING_AGENT_PKG = '@earendil-works/pi-coding-agent';
const MODEL_RESOLVER_REL = 'dist/core/model-resolver.js';
const INSTALL_HINT =
  'Install @earendil-works/pi-coding-agent where pi can resolve it ' +
  '(e.g. cd ~/.pi/agent/npm && npm install @earendil-works/pi-coding-agent).';

function hasModelResolver(pkgDir: string): boolean {
  return existsSync(join(pkgDir, MODEL_RESOLVER_REL));
}

function collectAncestorPackageDirs(startDir: string, maxDepth = 12): string[] {
  const candidates: string[] = [];
  let dir = startDir;
  for (let i = 0; i < maxDepth; i++) {
    candidates.push(join(dir, 'node_modules', PI_CODING_AGENT_PKG));
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return candidates;
}

function resolvePiBinaryPackageDirs(): string[] {
  try {
    const piBin = execSync('which pi', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!piBin) {
      return [];
    }
    return collectAncestorPackageDirs(dirname(realpathSync(piBin)), 8);
  } catch {
    return [];
  }
}

function resolveViaModuleResolution(): string | undefined {
  const attempts: Array<() => string> = [
    () => fileURLToPath(import.meta.resolve(PI_CODING_AGENT_PKG)),
    () => createRequire(import.meta.url).resolve(`${PI_CODING_AGENT_PKG}/package.json`),
    () => createRequire(import.meta.url).resolve(`${PI_CODING_AGENT_PKG}/${MODEL_RESOLVER_REL}`),
  ];

  for (const attempt of attempts) {
    try {
      const resolvedPath = attempt();
      const marker = `node_modules/${PI_CODING_AGENT_PKG}`;
      const markerIndex = resolvedPath.lastIndexOf(marker);
      if (markerIndex === -1) {
        continue;
      }
      const pkgDir = resolvedPath.slice(0, markerIndex + marker.length);
      if (hasModelResolver(pkgDir)) {
        return pkgDir;
      }
    } catch {
      // Try the next resolution strategy.
    }
  }

  return undefined;
}

/** Locate pi-coding-agent on disk for the resolveModelScope shim. */
export function findPiCodingAgentDir(): string {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const addCandidate = (candidate: string): void => {
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  };

  const viaModuleResolution = resolveViaModuleResolution();
  if (viaModuleResolution) {
    addCandidate(viaModuleResolution);
  }

  for (const start of [dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    for (const candidate of collectAncestorPackageDirs(start)) {
      addCandidate(candidate);
    }
  }

  addCandidate(join(homedir(), '.pi/agent/npm/node_modules', PI_CODING_AGENT_PKG));

  if (process.env.HOMEBREW_PREFIX) {
    addCandidate(join(process.env.HOMEBREW_PREFIX, 'lib/node_modules', PI_CODING_AGENT_PKG));
  }

  for (const candidate of resolvePiBinaryPackageDirs()) {
    addCandidate(candidate);
  }

  for (const candidate of candidates) {
    if (hasModelResolver(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate ${PI_CODING_AGENT_PKG} for resolveModelScope. ${INSTALL_HINT}`,
  );
}

async function loadResolveModelScopeFn(): Promise<ResolveModelScopeFn> {
  try {
    const pkg = await import('@earendil-works/pi-coding-agent');
    const publicResolve = (pkg as { resolveModelScope?: ResolveModelScopeFn }).resolveModelScope;
    if (typeof publicResolve === 'function') {
      return publicResolve;
    }
  } catch {
    // Fall back to filesystem discovery when the public export is unavailable.
  }

  const piPkgDir = findPiCodingAgentDir();
  const modelResolver = await import(
    pathToFileURL(join(piPkgDir, MODEL_RESOLVER_REL)).href
  );
  return modelResolver.resolveModelScope as ResolveModelScopeFn;
}

let resolveModelScopeFnPromise: Promise<ResolveModelScopeFn> | undefined;

function getResolveModelScopeFn(): Promise<ResolveModelScopeFn> {
  resolveModelScopeFnPromise ??= loadResolveModelScopeFn();
  return resolveModelScopeFnPromise;
}

/** Delegate to pi's resolveModelScope (not yet on the public package export surface). */
export function resolveModelScope(
  patterns: string[],
  modelRegistry: ModelRegistry,
): Promise<ScopedModel[]> {
  return getResolveModelScopeFn().then((fn) => fn(patterns, modelRegistry));
}
