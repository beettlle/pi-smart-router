/**
 * Unit tests for pi-CLI adversarial clients (SP-288 / #169).
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseAdversarialCampaignArgs,
  runAdversarialCampaignCli,
} from '../../scripts/calibration/adversarial-label-campaign.js';
import {
  assertPiCliGraderAllowed,
  buildPiCliArgs,
  createPiCliGenerator,
  createPiCliGrader,
  isExcludedFromCampaign,
  isForbiddenGrader,
  loadPiEnabledModels,
  parsePiCliClientSpec,
  pickScopedCampaignClients,
  PiCliClientError,
  type PiSpawnFn,
} from '../../scripts/calibration/pi-cli-clients.js';

describe('pi-cli-adversarial-clients (SP-288)', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeSettings(enabledModels: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'sp288-settings-'));
    tempDirs.push(dir);
    const path = join(dir, 'settings.json');
    writeFileSync(path, JSON.stringify({ enabledModels }, null, 2), 'utf8');
    return path;
  }

  it('excludes smart-router and forbids cursor/auto as grader', () => {
    expect(isExcludedFromCampaign('smart-router/auto')).toBe(true);
    expect(isExcludedFromCampaign('google/gemini-flash-latest')).toBe(false);
    expect(isExcludedFromCampaign('google/gemini-3.1-pro-preview-customtools')).toBe(true);
    expect(isForbiddenGrader('cursor/auto')).toBe(true);
    expect(isForbiddenGrader('kimi-coding/k3')).toBe(false);
  });

  it('picks flash/lite graders and other models as generators', () => {
    const enabled = [
      'smart-router/auto',
      'cursor/auto',
      'zai/glm-5.3',
      'google/gemini-flash-latest',
      'google/gemini-3.1-pro-preview-customtools',
      'kimi-coding/k3',
      'google/gemini-flash-lite-latest',
      'zai/glm-5.3-flash',
    ];
    const picked = pickScopedCampaignClients(enabled);
    expect(picked.graders.map((r) => r.providerModel)).toEqual([
      'google/gemini-flash-latest',
      'google/gemini-flash-lite-latest',
    ]);
    expect(picked.generators.map((r) => r.providerModel)).toEqual([
      'kimi-coding/k3',
      'zai/glm-5.3',
    ]);
    expect(picked.graders.every((r) => r.providerModel !== 'cursor/auto')).toBe(true);
    expect(
      [...picked.generators, ...picked.graders].every(
        (r) => !r.providerModel.includes('customtools'),
      ),
    ).toBe(true);
  });

  it('fails when fewer than 4 eligible models after exclusions', () => {
    expect(() =>
      pickScopedCampaignClients([
        'cursor/auto',
        'smart-router/auto',
        'google/a',
        'google/b',
        'google/c',
      ]),
    ).toThrow(/Need ≥4 scoped models/);
  });

  it('loads enabledModels from settings JSON', () => {
    const path = writeSettings(['google/gemini-flash-latest', 'kimi-coding/k3']);
    expect(loadPiEnabledModels(path)).toEqual([
      'google/gemini-flash-latest',
      'kimi-coding/k3',
    ]);
  });

  it('parsePiCliClientSpec rejects @endpoint and smart-router', () => {
    expect(parsePiCliClientSpec('gen-a=google/gemini-flash-latest')).toMatchObject({
      id: 'gen-a',
      provider: 'google',
      model: 'gemini-flash-latest',
    });
    expect(() => parsePiCliClientSpec('gen-a=gpt@https://api.openai.com/v1')).toThrow(
      /must not use @endpoint/,
    );
    expect(() => parsePiCliClientSpec('gen-a=smart-router/auto')).toThrow(/excluded/);
  });

  it('assertPiCliGraderAllowed rejects cursor/auto', () => {
    const ref = parsePiCliClientSpec('judge=cursor/auto');
    expect(() => assertPiCliGraderAllowed(ref)).toThrow(/cursor\/auto/);
  });

  it('buildPiCliArgs includes completion-safe flags', () => {
    const ref = parsePiCliClientSpec('gen-0=google/gemini-flash-latest');
    const args = buildPiCliArgs(ref, 'hello');
    expect(args).toEqual([
      '-p',
      '--no-tools',
      '--no-extensions',
      '--no-context-files',
      '--no-approve',
      '--provider',
      'google',
      '--model',
      'gemini-flash-latest',
      '--',
      'hello',
    ]);
  });

  it('generator returns pi stdout; empty stdout never invents', async () => {
    const ref = parsePiCliClientSpec('gen-0=google/gemini-flash-latest');
    const okSpawn: PiSpawnFn = async () => ({
      stdout: 'candidate response\n',
      stderr: '',
      code: 0,
    });
    const gen = createPiCliGenerator(ref, { spawnFn: okSpawn });
    await expect(
      gen.generate({
        taskId: 't1',
        sessionId: 's1',
        promptText: 'do the thing',
        features: { prompt_length_norm: 0.1 },
      }),
    ).resolves.toBe('candidate response');

    const emptySpawn: PiSpawnFn = async () => ({
      stdout: '  \n',
      stderr: '',
      code: 0,
    });
    const emptyGen = createPiCliGenerator(ref, { spawnFn: emptySpawn });
    await expect(
      emptyGen.generate({
        taskId: 't1',
        sessionId: 's1',
        promptText: 'do the thing',
        features: { prompt_length_norm: 0.1 },
      }),
    ).rejects.toThrow(PiCliClientError);
  });

  it('grader parses score and fails closed on non-numeric', async () => {
    const ref = parsePiCliClientSpec('grader-0=zai/glm-5.3');
    const scoreSpawn: PiSpawnFn = async () => ({
      stdout: 'Score: 8\n',
      stderr: '',
      code: 0,
    });
    const grader = createPiCliGrader(ref, { spawnFn: scoreSpawn });
    await expect(
      grader.grade(
        { prompt_text: 'p', response_text: 'r' },
        { taskId: 't1', generatorId: 'gen-0' },
      ),
    ).resolves.toBe(8);

    const badSpawn: PiSpawnFn = async () => ({
      stdout: 'no digit here',
      stderr: '',
      code: 0,
    });
    const badGrader = createPiCliGrader(ref, { spawnFn: badSpawn });
    await expect(
      badGrader.grade(
        { prompt_text: 'p', response_text: 'r' },
        { taskId: 't1', generatorId: 'gen-0' },
      ),
    ).rejects.toThrow(/unparseable score/);
  });

  it('parseAdversarialCampaignArgs accepts pi-cli flags', () => {
    const args = parseAdversarialCampaignArgs([
      '--pi-cli',
      '--from-scoped-models',
      '--pi-settings',
      '/tmp/settings.json',
      '--pi-timeout-ms',
      '300000',
      '--input',
      't.jsonl',
      '--output',
      'o.jsonl',
      '--holdout-output',
      'h.jsonl',
      '--report',
      'r.json',
    ]);
    expect(args.piCli).toBe(true);
    expect(args.fromScopedModels).toBe(true);
    expect(args.piSettings).toBe('/tmp/settings.json');
    expect(args.piTimeoutMs).toBe(300_000);
  });

  it('CLI rejects combining --recorded with --pi-cli', async () => {
    const code = await runAdversarialCampaignCli([
      '--recorded',
      'rec.jsonl',
      '--pi-cli',
      '--input',
      't.jsonl',
      '--output',
      'o.jsonl',
      '--holdout-output',
      'h.jsonl',
      '--report',
      'r.json',
      '--generator',
      'a',
      '--generator',
      'b',
      '--grader',
      'c',
      '--grader',
      'd',
    ]);
    expect(code).toBe(1);
  });

  it('CLI rejects cursor/auto as explicit pi-cli grader', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp288-cli-'));
    tempDirs.push(dir);
    const tasks = join(dir, 'tasks.jsonl');
    writeFileSync(
      tasks,
      `${JSON.stringify({
        task_id: 't1',
        session_id: 's1',
        prompt_text: 'p',
        features: { prompt_length_norm: 0.1 },
      })}\n`,
      'utf8',
    );
    await expect(
      runAdversarialCampaignCli([
        '--pi-cli',
        '--input',
        tasks,
        '--output',
        join(dir, 'fit.jsonl'),
        '--holdout-output',
        join(dir, 'hold.jsonl'),
        '--report',
        join(dir, 'report.json'),
        '--generator',
        'gen-a=google/gemini-flash-latest',
        '--generator',
        'gen-b=kimi-coding/k3',
        '--grader',
        'judge-1=cursor/auto',
        '--grader',
        'judge-2=zai/glm-5.3',
      ]),
    ).rejects.toThrow(/cursor\/auto/);
  });
});
