import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for pi 1.x extension-loader warnings (GitHub #176).
 *
 * pi's resource-loader (collectExtensionPackageWarnings) warns when an
 * extension package lists a host-provided package in `dependencies`; host
 * packages must be peerDependencies with a "*" range so the loader can
 * dedupe them against the host runtime.
 *
 * Keep this list in sync with HOST_PROVIDED_EXTENSION_PACKAGES in
 * @earendil-works/pi-coding-agent dist/core/resource-loader.js.
 */
const HOST_PROVIDED_PACKAGES = [
  '@earendil-works/pi-agent-core',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-tui',
  '@mariozechner/pi-agent-core',
  '@mariozechner/pi-ai',
  '@mariozechner/pi-coding-agent',
  '@mariozechner/pi-tui',
  '@sinclair/typebox',
  'typebox',
] as const;

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

const manifest = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf8'),
) as PackageManifest;

describe('package manifest host-provided packages', () => {
  it('lists no host-provided package in dependencies', () => {
    const offenders = Object.keys(manifest.dependencies ?? {}).filter((name) =>
      (HOST_PROVIDED_PACKAGES as readonly string[]).includes(name),
    );
    expect(offenders).toEqual([]);
  });

  it('declares every host-provided peer with a "*" range', () => {
    const peers = manifest.peerDependencies ?? {};
    const offenders = Object.entries(peers).filter(
      ([name, range]) =>
        (HOST_PROVIDED_PACKAGES as readonly string[]).includes(name) && range !== '*',
    );
    expect(offenders).toEqual([]);
  });

  it('keeps host-provided peers optional so npm does not auto-install duplicates', () => {
    const peers = manifest.peerDependencies ?? {};
    const meta = manifest.peerDependenciesMeta ?? {};
    const offenders = Object.keys(peers).filter(
      (name) =>
        (HOST_PROVIDED_PACKAGES as readonly string[]).includes(name) &&
        meta[name]?.optional !== true,
    );
    expect(offenders).toEqual([]);
  });

  it('keeps @earendil-works/pi-ai available for local development via devDependencies', () => {
    expect(manifest.devDependencies?.['@earendil-works/pi-ai']).toBeDefined();
  });
});
