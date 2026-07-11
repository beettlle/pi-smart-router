import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PI_MODEL_SCOPE_PATH = join(
  process.cwd(),
  '.pi/extensions/smart-router/pi-model-scope.ts',
);
const PI_MODEL_SCOPE_URL = pathToFileURL(PI_MODEL_SCOPE_PATH).href;
const MODEL_RESOLVER_REL = 'dist/core/model-resolver.js';

function writeModelResolverStub(pkgDir: string): void {
  mkdirSync(join(pkgDir, 'dist/core'), { recursive: true });
  writeFileSync(
    join(pkgDir, MODEL_RESOLVER_REL),
    'export async function resolveModelScope() { return []; }',
  );
}

function createConsumerFixture(): {
  homeDir: string;
  projectDir: string;
  agentPiCodingAgentDir: string;
  moduleUrl: string;
  cleanup: () => void;
} {
  const homeDir = mkdtempSync(join(tmpdir(), 'sp140-home-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'sp140-project-'));
  const agentPiCodingAgentDir = join(
    homeDir,
    '.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent',
  );
  const extensionDir = join(
    homeDir,
    '.pi/agent/npm/node_modules/pi-smart-router/.pi/extensions/smart-router',
  );

  writeModelResolverStub(agentPiCodingAgentDir);
  mkdirSync(extensionDir, { recursive: true });
  const modulePath = join(extensionDir, 'pi-model-scope.ts');
  writeFileSync(modulePath, readFileSync(PI_MODEL_SCOPE_PATH, 'utf8'));

  return {
    homeDir,
    projectDir,
    agentPiCodingAgentDir,
    moduleUrl: pathToFileURL(modulePath).href,
    cleanup: () => {
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    },
  };
}

describe('pi-model-scope', () => {
  const originalCwd = process.cwd();
  let consumerFixture: ReturnType<typeof createConsumerFixture> | undefined;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    consumerFixture?.cleanup();
    consumerFixture = undefined;
    vi.unstubAllEnvs();
    process.chdir(originalCwd);
  });

  it('findPiCodingAgentDir resolves from dev-repo ancestor walk', async () => {
    process.chdir(process.cwd());
    const { findPiCodingAgentDir } = await import(PI_MODEL_SCOPE_URL);
    const pkgDir = findPiCodingAgentDir();

    expect(hasModelResolver(pkgDir)).toBe(true);
    expect(existsSync(join(pkgDir, 'package.json'))).toBe(true);
  });

  it('findPiCodingAgentDir resolves from ~/.pi/agent/npm in a consumer layout', async () => {
    consumerFixture = createConsumerFixture();
    vi.stubEnv('HOME', consumerFixture.homeDir);
    process.chdir(consumerFixture.projectDir);

    const { findPiCodingAgentDir } = await import(consumerFixture.moduleUrl);
    expect(realpathSync(findPiCodingAgentDir())).toBe(
      realpathSync(consumerFixture.agentPiCodingAgentDir),
    );
  });

  it('loads resolveModelScope without repo dev node_modules on cwd', async () => {
    consumerFixture = createConsumerFixture();
    vi.stubEnv('HOME', consumerFixture.homeDir);
    process.chdir(consumerFixture.projectDir);

    const { resolveModelScope } = await import(consumerFixture.moduleUrl);
    expect(typeof resolveModelScope).toBe('function');
    await expect(resolveModelScope([], {} as never)).resolves.toEqual([]);
  }, 15_000);

  it('findPiCodingAgentDir resolves without agent npm when pi is globally installed', async () => {
    try {
      execSync('which pi', { stdio: 'ignore' });
    } catch {
      return;
    }

    const homeDir = mkdtempSync(join(tmpdir(), 'sp140-empty-home-'));
    const projectDir = mkdtempSync(join(tmpdir(), 'sp140-empty-project-'));
    const extensionDir = join(
      homeDir,
      '.pi/agent/npm/node_modules/pi-smart-router/.pi/extensions/smart-router',
    );
    mkdirSync(extensionDir, { recursive: true });
    const modulePath = join(extensionDir, 'pi-model-scope.ts');
    writeFileSync(modulePath, readFileSync(PI_MODEL_SCOPE_PATH, 'utf8'));

    consumerFixture = {
      homeDir,
      projectDir,
      agentPiCodingAgentDir: join(homeDir, '.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent'),
      moduleUrl: pathToFileURL(modulePath).href,
      cleanup: () => {
        rmSync(homeDir, { recursive: true, force: true });
        rmSync(projectDir, { recursive: true, force: true });
      },
    };

    vi.stubEnv('HOME', homeDir);
    process.chdir(projectDir);

    const { findPiCodingAgentDir } = await import(consumerFixture.moduleUrl);
    const resolved = realpathSync(findPiCodingAgentDir());
    expect(hasModelResolver(resolved)).toBe(true);
  });

  it('throws a clear install hint when pi-coding-agent cannot be located', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sp140-missing-home-'));
    const projectDir = mkdtempSync(join(tmpdir(), 'sp140-missing-project-'));
    const isolatedExtDir = mkdtempSync(join(tmpdir(), 'sp140-isolated-ext-'));
    const isolatedModulePath = join(isolatedExtDir, 'pi-model-scope.ts');
    writeFileSync(
      isolatedModulePath,
      readFileSync(PI_MODEL_SCOPE_PATH, 'utf8'),
    );

    consumerFixture = {
      homeDir,
      projectDir,
      agentPiCodingAgentDir: join(homeDir, '.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent'),
      moduleUrl: pathToFileURL(isolatedModulePath).href,
      cleanup: () => {
        rmSync(homeDir, { recursive: true, force: true });
        rmSync(projectDir, { recursive: true, force: true });
        rmSync(isolatedExtDir, { recursive: true, force: true });
      },
    };

    vi.stubEnv('HOME', homeDir);
    vi.stubEnv('HOMEBREW_PREFIX', '');
    process.chdir(projectDir);

    vi.doMock('node:child_process', () => ({
      execSync: vi.fn(() => {
        throw new Error('pi not found');
      }),
    }));

    const { findPiCodingAgentDir, resolveModelScope } = await import(
      `${pathToFileURL(isolatedModulePath).href}?missing=${Date.now()}`
    );

    expect(() => findPiCodingAgentDir()).toThrow(
      /Unable to locate @earendil-works\/pi-coding-agent for resolveModelScope/,
    );
    expect(() => findPiCodingAgentDir()).toThrow(/npm install @earendil-works\/pi-coding-agent/);
    await expect(resolveModelScope([], {} as never)).rejects.toThrow(
      /Unable to locate @earendil-works\/pi-coding-agent for resolveModelScope/,
    );
  });
});

function hasModelResolver(pkgDir: string): boolean {
  return existsSync(join(pkgDir, MODEL_RESOLVER_REL));
}

describe('pi-model-scope resolution strategy', () => {
  it('documents public-import-first and fallback resolution paths', () => {
    const source = readFileSync(
      join(process.cwd(), '.pi/extensions/smart-router/pi-model-scope.ts'),
      'utf8',
    );
    expect(source).toContain("import('@earendil-works/pi-coding-agent')");
    expect(source).toContain('.pi/agent/npm/node_modules');
    expect(source).toContain('import.meta.resolve');
    expect(source).toContain('createRequire');
    expect(source).toContain('which pi');
  });
});
