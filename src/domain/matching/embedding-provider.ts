/**
 * Shared ONNX text embedders — SP-100 (MiniLM), SP-156 (Granite trial).
 *
 * Embeds prompt text for HyDRA requirement projection and semantic cluster
 * matching. One ONNX session per instance; share across matchers via a single
 * factory call and coordinated dispose().
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Encoder } from '../types/schemas.js';
import { DEFAULT_ENCODER } from '../types/schemas.js';

export const EMBEDDING_DIM = 384;

/** MiniLM ONNX model (384-dim, 512-token context). */
export const MINILM_ONNX_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Granite 97M ONNX artifact for @huggingface/transformers.
 * Source weights: ibm-granite/granite-embedding-97m-multilingual-r2 (384-dim).
 */
export const GRANITE_ONNX_MODEL =
  'onnx-community/granite-embedding-97m-multilingual-r2-ONNX';

export interface TextEmbedder {
  embed(text: string): Promise<Float32Array>;
  dispose(): Promise<void>;
}

// ─── ONNX artifact digest pinning (SP-259, #147) ─────────────────────────────

/**
 * Artifact pin verification mode:
 * - `off` — no verification (default; preserves unpinned local dogfood downloads)
 * - `verify` — verify cached artifacts when pins exist for the model; fail
 *   closed on digest mismatch or missing cached artifact. Models without pins
 *   remain unpinned (first-run download allowed).
 * - `enforce` — CI/prod mode: pins are REQUIRED for the model; fail closed when
 *   the pin file is missing/unparseable, the model has no pins, a pinned
 *   artifact is missing from the cache, or any digest mismatches.
 */
export type OnnxArtifactPinMode = 'off' | 'verify' | 'enforce';

export const ONNX_ARTIFACT_PIN_MODES: readonly OnnxArtifactPinMode[] = [
  'off',
  'verify',
  'enforce',
];

/** Default pin file (relative to process CWD). Override via options or env. */
export const DEFAULT_ONNX_PIN_FILE = 'config/onnx-artifact-pins.json';

/** Env vars (operator wiring; schemas/hydra-matcher out of SP-259 scope). */
export const ONNX_PIN_MODE_ENV = 'SMART_ROUTER_ONNX_PIN_MODE';
export const ONNX_PIN_FILE_ENV = 'SMART_ROUTER_ONNX_PIN_FILE';

/** Pin file shape: per-model map of cache-relative file path → SHA-256 hex. */
export interface OnnxArtifactPinFile {
  readonly version: number;
  readonly pins: Record<string, Record<string, string>>;
}

export interface OnnxPinOptions {
  /** Pin mode. Default: $SMART_ROUTER_ONNX_PIN_MODE, else 'off'. */
  readonly pinMode?: OnnxArtifactPinMode;
  /** Pin file path. Default: $SMART_ROUTER_ONNX_PIN_FILE, else DEFAULT_ONNX_PIN_FILE. */
  readonly pinFilePath?: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

function resolvePinMode(options?: OnnxPinOptions): OnnxArtifactPinMode {
  const raw = options?.pinMode ?? process.env[ONNX_PIN_MODE_ENV] ?? 'off';
  if ((ONNX_ARTIFACT_PIN_MODES as readonly string[]).includes(raw)) {
    return raw as OnnxArtifactPinMode;
  }
  throw new Error(
    `Invalid ONNX artifact pin mode "${raw}" (${ONNX_PIN_MODE_ENV}). ` +
      `Expected one of: ${ONNX_ARTIFACT_PIN_MODES.join(', ')}`,
  );
}

async function loadPinFile(
  pinFilePath: string,
  mode: OnnxArtifactPinMode,
): Promise<OnnxArtifactPinFile | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(pinFilePath, 'utf8');
  } catch {
    if (mode === 'enforce') {
      throw new Error(
        `ONNX artifact pin mode 'enforce' requires a readable pin file at ${pinFilePath} (fail closed)`,
      );
    }
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `ONNX artifact pin file ${pinFilePath} is not valid JSON (fail closed)`,
    );
  }
  const candidate = parsed as Partial<OnnxArtifactPinFile>;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof candidate.pins !== 'object' ||
    candidate.pins === null
  ) {
    throw new Error(
      `ONNX artifact pin file ${pinFilePath} must contain a "pins" object (fail closed)`,
    );
  }
  return candidate as OnnxArtifactPinFile;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  hash.update(await fs.readFile(filePath));
  return hash.digest('hex');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate a cached artifact. transformers.js FS cache stores files at
 * `<cacheDir>/<modelId>/<relPath>`; also support hub-style
 * `<cacheDir>/models--<org>--<name>/snapshots/<revision>/<relPath>`.
 */
async function findCachedArtifact(
  cachePath: string,
  modelId: string,
  relPath: string,
): Promise<string | undefined> {
  const flat = path.join(cachePath, modelId, relPath);
  if (await pathExists(flat)) return flat;

  const hubDir = path.join(cachePath, `models--${modelId.replace(/\//g, '--')}`);
  try {
    const snapshotsDir = path.join(hubDir, 'snapshots');
    for (const revision of await fs.readdir(snapshotsDir)) {
      const candidate = path.join(snapshotsDir, revision, relPath);
      if (await pathExists(candidate)) return candidate;
    }
  } catch {
    /* no hub-style cache for this model */
  }
  return undefined;
}

/**
 * Verify cached ONNX artifacts for `modelId` against configured SHA-256 pins.
 * Fails closed on digest mismatch or missing pinned artifact; in `enforce`
 * mode also fails when the pin file or model pins are missing.
 *
 * Runs after pipeline load so first-run downloads are verified before the
 * embedder is returned; a mismatching session is never usable.
 */
export async function verifyOnnxArtifactPins(
  modelId: string,
  cachePath: string,
  options?: OnnxPinOptions,
): Promise<void> {
  const mode = resolvePinMode(options);
  if (mode === 'off') return;

  const pinFilePath =
    options?.pinFilePath ??
    process.env[ONNX_PIN_FILE_ENV] ??
    DEFAULT_ONNX_PIN_FILE;
  const pinFile = await loadPinFile(pinFilePath, mode);
  const modelPins = pinFile?.pins[modelId];

  if (modelPins === undefined || Object.keys(modelPins).length === 0) {
    if (mode === 'enforce') {
      throw new Error(
        `ONNX artifact pin mode 'enforce' requires pins for ${modelId} in ${pinFilePath} (fail closed)`,
      );
    }
    return; // verify mode, no pins configured → unpinned dogfood allowed
  }

  for (const [relPath, expectedDigest] of Object.entries(modelPins)) {
    if (!SHA256_HEX.test(expectedDigest)) {
      throw new Error(
        `Invalid SHA-256 pin for ${modelId} ${relPath} in ${pinFilePath}: "${expectedDigest}" (fail closed)`,
      );
    }
    const cached = await findCachedArtifact(cachePath, modelId, relPath);
    if (cached === undefined) {
      throw new Error(
        `Pinned ONNX artifact missing from cache: ${modelId} ${relPath} under ${cachePath} (fail closed)`,
      );
    }
    const actualDigest = await sha256File(cached);
    if (actualDigest !== expectedDigest) {
      throw new Error(
        `ONNX artifact digest mismatch for ${modelId} ${relPath}: expected sha256 ${expectedDigest}, got ${actualDigest} (${cached}). Refusing to load (fail closed)`,
      );
    }
  }
}

// ─── ONNX runtime types ───────────────────────────────────────────────────────

interface OnnxPipelineOutput {
  readonly data: Float32Array;
}

type OnnxExtractorFn = (
  text: string,
  options: { readonly pooling: string; readonly normalize: boolean },
) => Promise<OnnxPipelineOutput>;

/**
 * transformers.js pipeline callable plus its release handles. v3/v4 pipelines
 * expose `dispose()` (releases the underlying ONNX inference sessions); the
 * wrapped model's `dispose()` is the fallback handle (SP-260, #147).
 */
type OnnxPipeline = OnnxExtractorFn & {
  readonly dispose?: () => Promise<void>;
  readonly model?: { readonly dispose?: () => Promise<void> };
};

interface TransformersModule {
  pipeline(
    task: string,
    model: string,
    options: Record<string, unknown>,
  ): Promise<OnnxPipeline>;
}

async function loadTransformersModule(): Promise<TransformersModule> {
  const moduleName = '@huggingface/transformers';
  try {
    return (await import(moduleName)) as TransformersModule;
  } catch {
    throw new Error(
      `ONNX embedding requires ${moduleName}. Install: npm i ${moduleName}`,
    );
  }
}

async function createOnnxFeatureEmbedder(
  modelId: string,
  artifactCachePath: string,
  pinOptions?: OnnxPinOptions,
): Promise<TextEmbedder> {
  const mod = await loadTransformersModule();
  const extractor: OnnxPipeline = await mod.pipeline(
    'feature-extraction',
    modelId,
    { cache_dir: artifactCachePath },
  );

  // SP-259: verify cached artifact digests after load (first-run downloads are
  // verified before the embedder is returned; mismatch → fail closed).
  await verifyOnnxArtifactPins(modelId, artifactCachePath, pinOptions);

  // SP-260 (#147): disposed embedders fail closed on embed() rather than
  // silently recreating an ONNX session behind the caller's back.
  let disposed = false;

  return {
    async embed(text: string): Promise<Float32Array> {
      if (disposed) {
        throw new Error(
          `TextEmbedder for ${modelId} has been disposed; embed() fails closed. ` +
            'Create a new embedder via createTextEmbedder to continue.',
        );
      }
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });
      if (output.data.length !== EMBEDDING_DIM) {
        throw new Error(
          `Embedding shape mismatch: expected ${EMBEDDING_DIM}, got ${output.data.length}`,
        );
      }
      return output.data;
    },

    async dispose(): Promise<void> {
      if (disposed) return; // idempotent: safe for shared-factory callers
      disposed = true;
      // Release the strongest available handle: pipeline.dispose() releases
      // the ONNX inference sessions (transformers.js v3/v4); model.dispose()
      // is the documented fallback. Fail loud when neither exists rather than
      // pretending resources were freed.
      if (typeof extractor.dispose === 'function') {
        await extractor.dispose();
        return;
      }
      if (typeof extractor.model?.dispose === 'function') {
        await extractor.model.dispose();
        return;
      }
      throw new Error(
        `No dispose handle on @huggingface/transformers pipeline for ${modelId}: ` +
          'expected pipeline.dispose() or model.dispose(). ONNX sessions may be ' +
          'leaked; upgrade @huggingface/transformers.',
      );
    },
  };
}

/**
 * Creates a TextEmbedder backed by @huggingface/transformers ONNX runtime.
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim).
 *
 * The package is loaded dynamically — not required at compile time.
 * Install: `npm i @huggingface/transformers`
 */
export async function createOnnxTextEmbedder(
  artifactCachePath: string,
  pinOptions?: OnnxPinOptions,
): Promise<TextEmbedder> {
  return createOnnxFeatureEmbedder(MINILM_ONNX_MODEL, artifactCachePath, pinOptions);
}

/**
 * Granite 97M long-context embedder (384-dim ONNX drop-in for SP-115 head).
 * Model: ibm-granite/granite-embedding-97m-multilingual-r2 via ONNX runtime.
 */
export async function createGraniteOnnxTextEmbedder(
  artifactCachePath: string,
  pinOptions?: OnnxPinOptions,
): Promise<TextEmbedder> {
  return createOnnxFeatureEmbedder(GRANITE_ONNX_MODEL, artifactCachePath, pinOptions);
}

/** Select ONNX text embedder by operator encoder flag. */
export async function createTextEmbedder(
  encoder: Encoder = DEFAULT_ENCODER,
  artifactCachePath: string,
  pinOptions?: OnnxPinOptions,
): Promise<TextEmbedder> {
  switch (encoder) {
    case 'granite':
      return createGraniteOnnxTextEmbedder(artifactCachePath, pinOptions);
    case 'minilm':
      return createOnnxTextEmbedder(artifactCachePath, pinOptions);
    default: {
      const _exhaustive: never = encoder;
      throw new Error(`Unsupported encoder: ${String(_exhaustive)}`);
    }
  }
}
