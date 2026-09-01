/**
 * Contract test: config/operator-config.json.example must stay parseable by
 * OperatorConfigSchema so operators can copy it as a valid starting point
 * (SP-227, #152).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { OperatorConfigSchema } from '../../src/domain/types/schemas.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const examplePath = join(repoRoot, 'config', 'operator-config.json.example');

describe('operator-config.json.example', () => {
  it('parses successfully through OperatorConfigSchema', () => {
    const raw: unknown = JSON.parse(readFileSync(examplePath, 'utf8'));
    const result = OperatorConfigSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `operator-config.json.example failed validation: ${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it('carries the planning_delegate timeout fields (SP-213, #120)', () => {
    const raw: unknown = JSON.parse(readFileSync(examplePath, 'utf8'));
    const parsed = OperatorConfigSchema.parse(raw);
    expect(parsed.planning_delegate.global_timeout_ms).toBe(120_000);
    expect(parsed.planning_delegate.sub_call_timeout_ms).toBe(30_000);
  });

  it('carries a valid adaptive_reasoning section with floor ≤ ceiling (SP-246, #166)', () => {
    const raw: unknown = JSON.parse(readFileSync(examplePath, 'utf8'));
    const parsed = OperatorConfigSchema.parse(raw);
    expect(parsed.adaptive_reasoning).toEqual({
      enabled: true,
      min_level: 'low',
      max_level: 'high',
    });
  });
});
