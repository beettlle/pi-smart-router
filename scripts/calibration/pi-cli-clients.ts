/**
 * Pi-CLI adversarial clients — SP-288 / #169.
 *
 * Live generators/graders via `pi -p --provider … --model …` using the
 * operator’s scoped `enabledModels` (no ADVERSARIAL_LABEL_API_KEY).
 * `cursor/auto` is never a grader; `smart-router/*` is never a client.
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import {
  AdversarialLabelingError,
  GRADER_SYSTEM_PROMPT,
  MIN_GENERATORS,
  MIN_GRADERS,
  assertGeneratorBlinded,
  normalizeGraderScore,
  type AdversarialTask,
  type BlindedGraderInput,
  type GeneratorClient,
  type GraderClient,
  type GradingContext,
} from './adversarial-label-campaign.js';

export const DEFAULT_PI_CLI_TIMEOUT_MS = 120_000;
export const FORBIDDEN_GRADER_MODEL = 'cursor/auto' as const;
export const MIN_SCOPED_ELIGIBLE_MODELS = 4;

export interface PiModelRef {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  /** Canonical `provider/model` id from pi settings / CLI. */
  readonly providerModel: string;
}

export interface PiSpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

export type PiSpawnFn = (
  args: readonly string[],
  options: { readonly timeoutMs: number },
) => Promise<PiSpawnResult>;

export class PiCliClientError extends Error {
  override readonly name = 'PiCliClientError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Default settings path: ~/.pi/agent/settings.json (override via env / flag). */
export function defaultPiAgentSettingsPath(): string {
  const fromEnv = process.env.PI_AGENT_SETTINGS;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return join(homedir(), '.pi', 'agent', 'settings.json');
}

/** True for smart-router/* — never a campaign generator or grader. */
export function isExcludedFromCampaign(providerModel: string): boolean {
  return providerModel === 'smart-router/auto' || providerModel.startsWith('smart-router/');
}

/** True for cursor/auto — forbidden as a grader (judge). */
export function isForbiddenGrader(providerModel: string): boolean {
  return providerModel === FORBIDDEN_GRADER_MODEL;
}

export function splitProviderModel(providerModel: string): {
  provider: string;
  model: string;
} {
  const slash = providerModel.indexOf('/');
  if (slash <= 0 || slash === providerModel.length - 1) {
    throw new PiCliClientError(
      `Expected provider/model id; got "${providerModel}"`,
    );
  }
  return {
    provider: providerModel.slice(0, slash),
    model: providerModel.slice(slash + 1),
  };
}

/** Load `enabledModels` from a pi agent settings.json file. */
export function loadPiEnabledModels(settingsPath: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(settingsPath, 'utf8');
  } catch (error) {
    throw new PiCliClientError(
      `Failed to read pi settings at ${settingsPath}: ${(error as Error).message}`,
      { cause: error },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PiCliClientError(
      `Invalid JSON in pi settings ${settingsPath}: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (!isPlainObject(parsed)) {
    throw new PiCliClientError(`pi settings root must be an object (${settingsPath})`);
  }
  const enabled = parsed.enabledModels;
  if (!Array.isArray(enabled)) {
    throw new PiCliClientError(
      `pi settings missing enabledModels array (${settingsPath})`,
    );
  }
  const models: string[] = [];
  for (let i = 0; i < enabled.length; i++) {
    const entry = enabled[i];
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new PiCliClientError(
        `enabledModels[${i}] must be a non-empty string (${settingsPath})`,
      );
    }
    models.push(entry.trim());
  }
  return models;
}

/**
 * After exclusions, sort remaining ids; first 2 → generators, next 2 → graders.
 * Requires ≥4 grader-safe eligible models (no smart-router/*, no cursor/auto).
 */
export function pickScopedCampaignClients(enabled: readonly string[]): {
  readonly generators: PiModelRef[];
  readonly graders: PiModelRef[];
} {
  const eligible = [...new Set(enabled)]
    .filter((id) => !isExcludedFromCampaign(id))
    .filter((id) => !isForbiddenGrader(id))
    .sort((a, b) => a.localeCompare(b));

  if (eligible.length < MIN_SCOPED_ELIGIBLE_MODELS) {
    throw new PiCliClientError(
      `Need ≥${MIN_SCOPED_ELIGIBLE_MODELS} scoped models after excluding ` +
        `smart-router/* and cursor/auto; got ${eligible.length}: [${eligible.join(', ')}]`,
    );
  }

  const toRef = (clientId: string, providerModel: string): PiModelRef => {
    const { provider, model } = splitProviderModel(providerModel);
    return { id: clientId, provider, model, providerModel };
  };

  const generators = [
    toRef('gen-0', eligible[0]!),
    toRef('gen-1', eligible[1]!),
  ];
  const graders = [
    toRef('grader-0', eligible[2]!),
    toRef('grader-1', eligible[3]!),
  ];

  if (generators.length < MIN_GENERATORS || graders.length < MIN_GRADERS) {
    throw new PiCliClientError('Internal pick error: insufficient generators/graders');
  }

  return { generators, graders };
}

/** Parse `id=provider/model` for --pi-cli mode (no @endpoint). */
export function parsePiCliClientSpec(spec: string): PiModelRef {
  const eq = spec.indexOf('=');
  if (eq <= 0 || eq === spec.length - 1) {
    throw new PiCliClientError(
      `Pi-CLI client spec must be id=provider/model; got "${spec}"`,
    );
  }
  const id = spec.slice(0, eq);
  const providerModel = spec.slice(eq + 1);
  if (providerModel.includes('@')) {
    throw new PiCliClientError(
      `Pi-CLI spec must not use @endpoint (got "${spec}"); use id=provider/model`,
    );
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new PiCliClientError(`Invalid client id "${id}"`);
  }
  if (isExcludedFromCampaign(providerModel)) {
    throw new PiCliClientError(
      `Model "${providerModel}" is excluded from adversarial campaigns (smart-router/*)`,
    );
  }
  const { provider, model } = splitProviderModel(providerModel);
  return { id, provider, model, providerModel };
}

export function assertPiCliGraderAllowed(ref: PiModelRef): void {
  if (isForbiddenGrader(ref.providerModel)) {
    throw new PiCliClientError(
      `Grader must not be ${FORBIDDEN_GRADER_MODEL} (client id ${ref.id})`,
    );
  }
  if (isExcludedFromCampaign(ref.providerModel)) {
    throw new PiCliClientError(
      `Grader must not be smart-router/* (client id ${ref.id})`,
    );
  }
}

/** Build pi argv for a single completion-like call. */
export function buildPiCliArgs(
  ref: PiModelRef,
  userMessage: string,
): string[] {
  return [
    '-p',
    '--no-tools',
    '--no-extensions',
    '--no-context-files',
    '--no-approve',
    '--thinking',
    'off',
    '--provider',
    ref.provider,
    '--model',
    ref.model,
    '--',
    userMessage,
  ];
}

export function createDefaultPiSpawnFn(piBinary = 'pi'): PiSpawnFn {
  return (args, options) =>
    new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(piBinary, [...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGTERM');
        rejectPromise(
          new PiCliClientError(
            `pi CLI timed out after ${options.timeoutMs}ms (${args.join(' ').slice(0, 120)}…)`,
          ),
        );
      }, options.timeoutMs);

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        rejectPromise(
          new PiCliClientError(`Failed to spawn pi: ${error.message}`, { cause: error }),
        );
      });
      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolvePromise({
          stdout,
          stderr,
          code: code ?? 1,
        });
      });
    });
}

async function runPiCompletion(
  ref: PiModelRef,
  userMessage: string,
  context: string,
  spawnFn: PiSpawnFn,
  timeoutMs: number,
): Promise<string> {
  const args = buildPiCliArgs(ref, userMessage);
  const result = await spawnFn(args, { timeoutMs });
  if (result.code !== 0) {
    throw new PiCliClientError(
      `pi CLI failed (${context}): exit ${result.code}` +
        (result.stderr.trim().length > 0 ? ` — ${result.stderr.trim().slice(0, 400)}` : ''),
    );
  }
  const content = result.stdout.trim();
  if (content.length === 0) {
    throw new PiCliClientError(
      `pi CLI returned empty stdout (${context}) — never invent labels`,
    );
  }
  return content;
}

export interface PiCliClientOptions {
  readonly spawnFn?: PiSpawnFn;
  readonly timeoutMs?: number;
}

export function createPiCliGenerator(
  ref: PiModelRef,
  options?: PiCliClientOptions,
): GeneratorClient {
  if (isExcludedFromCampaign(ref.providerModel)) {
    throw new PiCliClientError(
      `Generator must not be smart-router/* (client id ${ref.id})`,
    );
  }
  const spawnFn = options?.spawnFn ?? createDefaultPiSpawnFn();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PI_CLI_TIMEOUT_MS;
  return {
    id: ref.id,
    async generate(task: AdversarialTask): Promise<string> {
      return runPiCompletion(
        ref,
        task.promptText,
        `generator ${ref.id} task ${task.taskId}`,
        spawnFn,
        timeoutMs,
      );
    },
  };
}

export function createPiCliGrader(
  ref: PiModelRef,
  options?: PiCliClientOptions,
): GraderClient {
  assertPiCliGraderAllowed(ref);
  const spawnFn = options?.spawnFn ?? createDefaultPiSpawnFn();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PI_CLI_TIMEOUT_MS;
  return {
    id: ref.id,
    async grade(input: BlindedGraderInput, context: GradingContext): Promise<number> {
      assertGeneratorBlinded(input, context.generatorId);
      const userMessage =
        `${GRADER_SYSTEM_PROMPT}\n\n` +
        `## Task\n${input.prompt_text}\n\n## Response\n${input.response_text}\n\n` +
        'Score (integer 0-9):';
      const content = await runPiCompletion(
        ref,
        userMessage,
        `grader ${ref.id} task ${context.taskId}`,
        spawnFn,
        timeoutMs,
      );
      const match = content.match(/[0-9]/);
      if (match === null) {
        throw new AdversarialLabelingError(
          `Grader ${ref.id} returned an unparseable score for task ${context.taskId} — never invent labels`,
        );
      }
      return normalizeGraderScore(
        Number.parseInt(match[0], 10),
        `grader ${ref.id} task ${context.taskId}`,
      );
    },
  };
}
