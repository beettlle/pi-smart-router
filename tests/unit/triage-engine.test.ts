/**
 * Triage engine tests — T025, T025b, T026.
 *
 * Verifies:
 *   - Aho-Corasick keyword classification (trivial vs complex)
 *   - AST cyclomatic scan (threshold 15)
 *   - Adversarial sanitization strips inflation vectors
 *   - Obfuscated prompts classified correctly after sanitization
 */

import { describe, expect, it } from 'vitest';

import {
  CYCLOMATIC_THRESHOLD,
  cyclomaticScan,
  sanitize,
  triage,
} from '../../src/domain/triage/triage-engine.js';
import {
  checkEntropyTail,
  normalizedTokenEntropy,
  tokenizeForEntropy,
} from '../../src/domain/triage/entropy-check.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

// ─── T026: Adversarial Sanitization ──────────────────────────────────────────

describe('sanitize (T026)', () => {
  it('strips base64-encoded blocks', () => {
    const base64 = 'A'.repeat(80);
    const result = sanitize(`Fix this ${base64} file`);
    expect(result).not.toContain(base64);
    expect(result).toContain('Fix this');
    expect(result).toContain('file');
  });

  it('strips long hex strings', () => {
    const hex = 'a1b2c3d4'.repeat(8);
    const result = sanitize(`Debug ${hex} issue`);
    expect(result).not.toContain(hex);
    expect(result).toContain('Debug');
  });

  it('strips HTML tags', () => {
    const result = sanitize('Fix <div class="big">the</div> bug');
    expect(result).not.toContain('<div');
    expect(result).not.toContain('</div>');
    expect(result).toContain('Fix');
    expect(result).toContain('the');
    expect(result).toContain('bug');
  });

  it('strips HTML comments', () => {
    const result = sanitize('Task <!-- hidden complex payload --> here');
    expect(result).not.toContain('hidden complex payload');
    expect(result).toContain('Task');
    expect(result).toContain('here');
  });

  it('removes URL-encoded sequences', () => {
    const result = sanitize('Rename%20the%20variable');
    expect(result).not.toContain('%20');
    expect(result).toContain('Renamethe');
  });

  it('collapses repeated characters', () => {
    const result = sanitize('Format this!!!!!!!!!! file');
    expect(result).toBe('Format this!! file');
  });

  it('normalizes horizontal whitespace without destroying newlines', () => {
    const result = sanitize('line one\n    indented\n      deep');
    expect(result).toContain('\n');
    expect(result).toContain('indented');
  });

  it('leaves clean text substantially unchanged', () => {
    const clean = 'Format this JSON file';
    expect(sanitize(clean)).toBe(clean);
  });

  it('handles empty string', () => {
    expect(sanitize('')).toBe('');
  });
});

// ─── T025: Aho-Corasick Keyword Classification ──────────────────────────────

describe('triage keyword scan (T025)', () => {
  describe('trivial prompts', () => {
    it.each([
      ['Format this JSON file', 'keyword_economical'],
      ['Lint the codebase', 'keyword_economical'],
      ['Rename the variable from foo to bar', 'keyword_economical'],
      ['Fix the typo in the README', 'keyword_economical'],
      ['Sort imports in the module', 'keyword_economical'],
      ['Add export for the helper function', 'keyword_economical'],
      ['Fix whitespace in the config', 'keyword_economical'],
      ['Remove unused import', 'keyword_economical'],
    ])('classifies "%s" as trivial (%s)', (prompt, expectedReason) => {
      const result = triage(prompt);
      expect(result.verdict).toBe('trivial');
      expect(result.reason_code).toBe(expectedReason);
      expect(result.trivial_hits).toBeGreaterThan(0);
    });
  });

  describe('complex prompts', () => {
    it.each([
      ['Debug the memory leak in the WebSocket handler', 'keyword_frontier'],
      ['Architect a distributed caching system', 'keyword_frontier'],
      ['Refactor the authentication module', 'keyword_frontier'],
      ['Fix the race condition in the worker pool', 'keyword_frontier'],
      ['Design a state machine for the checkout flow', 'keyword_frontier'],
      ['Investigate the deadlock in concurrent writes', 'keyword_frontier'],
      ['Optimize the algorithm for large datasets', 'keyword_frontier'],
    ])('classifies "%s" as complex (%s)', (prompt, expectedReason) => {
      const result = triage(prompt);
      expect(result.verdict).toBe('complex');
      expect(result.reason_code).toBe(expectedReason);
      expect(result.complex_hits).toBeGreaterThan(0);
    });
  });

  describe('repo-hygiene / destructive-intent (SP-176, #97)', () => {
    it.each([
      'help me clean up mistakenly added files in the repo',
      'Help me clean up the repo',
      'Please cleanup the repo after the accidental add',
      'Unstage the mistakenly added files',
      'Do not force push or run rm -rf on production',
    ])('classifies "%s" as complex (keyword_frontier)', (prompt) => {
      const result = triage(prompt);
      expect(result.verdict).toBe('complex');
      expect(result.reason_code).toBe('keyword_frontier');
      expect(result.complex_hits).toBeGreaterThan(0);
    });
  });

  describe('ambiguous prompts', () => {
    it('classifies generic prompt as ambiguous', () => {
      const result = triage('Hello, how are you?');
      expect(result.verdict).toBe('ambiguous');
      expect(result.reason_code).toBe('no_fast_path');
    });

    it('classifies empty prompt as ambiguous', () => {
      const result = triage('');
      expect(result.verdict).toBe('ambiguous');
      expect(result.reason_code).toBe('empty_prompt');
    });

    it('classifies whitespace-only prompt as ambiguous', () => {
      const result = triage('   \n\n  ');
      expect(result.verdict).toBe('ambiguous');
      expect(result.reason_code).toBe('empty_prompt');
    });
  });

  describe('word boundary enforcement', () => {
    it('does not match "format" inside "information"', () => {
      const result = triage('Gather information about the project');
      expect(result.trivial_hits).toBe(0);
    });

    it('does not match "lint" inside "splinter"', () => {
      const result = triage('Fix the splinter issue');
      expect(result.trivial_hits).toBe(0);
    });

    it('does not match "debug" inside "debugger" when "debugging" is present', () => {
      const result = triage('The debugging session found issues');
      expect(result.complex_hits).toBe(1);
    });
  });

  describe('mixed signals', () => {
    it('resolves to dominant set when complex > trivial', () => {
      const result = triage(
        'Refactor the architecture and fix the race condition, then format the output',
      );
      expect(result.verdict).toBe('complex');
      expect(result.complex_hits).toBeGreaterThan(result.trivial_hits);
    });

    it('resolves to dominant set when trivial > complex', () => {
      const result = triage(
        'Format the file, fix the typo, rename the variable, and lint the module to debug one thing',
      );
      expect(result.verdict).toBe('trivial');
      expect(result.trivial_hits).toBeGreaterThan(result.complex_hits);
    });
  });
});

// ─── T025b: AST Cyclomatic Scan ─────────────────────────────────────────────

describe('cyclomaticScan (T025b)', () => {
  it('returns baseline 1 for text without code', () => {
    expect(cyclomaticScan('Just a plain text prompt')).toBe(1);
  });

  it('counts decision points in fenced code blocks', () => {
    const prompt = [
      'Review this function:',
      '```typescript',
      'function process(items: string[]) {',
      '  for (const item of items) {',
      '    if (item.length > 0) {',
      '      console.log(item);',
      '    }',
      '  }',
      '}',
      '```',
    ].join('\n');
    const score = cyclomaticScan(prompt);
    expect(score).toBe(3); // 1 base + for + if
  });

  it('counts logical operators as decision points', () => {
    const prompt = [
      '```js',
      'if (a && b || c) {',
      '  return true;',
      '}',
      '```',
    ].join('\n');
    const score = cyclomaticScan(prompt);
    expect(score).toBe(4); // 1 base + if + && + ||
  });

  it('detects high cyclomatic complexity above threshold', () => {
    const branches = Array.from(
      { length: 16 },
      (_, i) => `  if (x === ${i}) { return ${i}; }`,
    ).join('\n');
    const prompt = `\`\`\`ts\nfunction f(x: number) {\n${branches}\n}\n\`\`\``;
    const score = cyclomaticScan(prompt);
    expect(score).toBeGreaterThanOrEqual(CYCLOMATIC_THRESHOLD);
  });

  it('falls back to indented blocks when no fences', () => {
    const prompt = [
      'Check this code:',
      '',
      '    if (a) {',
      '        for (const b of items) {',
      '            if (b && c) {',
      '                handle();',
      '            }',
      '        }',
      '    }',
    ].join('\n');
    const score = cyclomaticScan(prompt);
    expect(score).toBeGreaterThan(1);
  });

  it('counts Python-style elif', () => {
    const prompt = [
      '```python',
      'if x > 0:',
      '    pass',
      'elif x < 0:',
      '    pass',
      '```',
    ].join('\n');
    const score = cyclomaticScan(prompt);
    expect(score).toBe(3); // 1 base + if + elif
  });

  it('counts switch/case statements', () => {
    const prompt = [
      '```ts',
      'switch (action) {',
      '  case "start": break;',
      '  case "stop": break;',
      '  case "pause": break;',
      '}',
      '```',
    ].join('\n');
    const score = cyclomaticScan(prompt);
    expect(score).toBe(4); // 1 base + 3 cases
  });

  it('counts catch blocks', () => {
    const prompt = [
      '```ts',
      'try {',
      '  riskyOp();',
      '} catch (e) {',
      '  handle(e);',
      '}',
      '```',
    ].join('\n');
    const score = cyclomaticScan(prompt);
    expect(score).toBe(2); // 1 base + catch
  });

  it('counts nullish coalescing', () => {
    const prompt = [
      '```ts',
      'const x = a ?? b ?? c;',
      '```',
    ].join('\n');
    const score = cyclomaticScan(prompt);
    expect(score).toBe(3); // 1 base + 2 ??
  });
});

// ─── Triage verdict with cyclomatic ──────────────────────────────────────────

describe('triage with cyclomatic override', () => {
  it('classifies high-cyclomatic code as complex regardless of keywords', () => {
    const branches = Array.from(
      { length: 16 },
      (_, i) => `  if (x === ${i}) { return ${i}; }`,
    ).join('\n');
    const prompt = `Format this:\n\`\`\`ts\nfunction f(x: number) {\n${branches}\n}\n\`\`\``;
    const result = triage(prompt);
    expect(result.verdict).toBe('complex');
    expect(result.reason_code).toBe('cyclomatic_high');
    expect(result.cyclomatic_score).toBeGreaterThanOrEqual(CYCLOMATIC_THRESHOLD);
  });
});

// ─── Obfuscated / adversarial prompts ────────────────────────────────────────

describe('obfuscated prompt classification', () => {
  it('classifies trivial prompt with base64 padding correctly', () => {
    const padding = 'A'.repeat(100);
    const result = triage(`Format the file ${padding}`);
    expect(result.verdict).toBe('trivial');
    expect(result.reason_code).toBe('keyword_economical');
    expect(result.sanitized_length_delta).toBeGreaterThan(0);
  });

  it('classifies complex prompt with HTML noise correctly', () => {
    const result = triage(
      '<div><span>Debug</span></div> the <b>memory leak</b> in the handler',
    );
    expect(result.verdict).toBe('complex');
    expect(result.reason_code).toBe('keyword_frontier');
  });

  it('classifies trivial prompt with repeated char inflation correctly', () => {
    const result = triage('Lint!!!!!!!!!!! the codebase!!!!!!!!!!!');
    expect(result.verdict).toBe('trivial');
    expect(result.sanitized_length_delta).toBeGreaterThan(0);
  });

  it('classifies complex prompt hidden in HTML comments correctly', () => {
    const result = triage(
      'Format the file <!-- architect distributed microservices -->',
    );
    expect(result.verdict).toBe('trivial');
    expect(result.reason_code).toBe('keyword_economical');
    expect(result.sanitized_length_delta).toBeGreaterThan(0);
  });

  it('handles prompt with long hex and actual keywords', () => {
    const hex = 'deadbeef'.repeat(8);
    const result = triage(`Refactor ${hex} the module architecture`);
    expect(result.verdict).toBe('complex');
    expect(result.sanitized_length_delta).toBeGreaterThan(0);
  });
});

// ─── TriageResult shape ──────────────────────────────────────────────────────

describe('TriageResult contract', () => {
  it('returns all required fields', () => {
    const result = triage('Format this file');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('reason_code');
    expect(result).toHaveProperty('trivial_hits');
    expect(result).toHaveProperty('complex_hits');
    expect(result).toHaveProperty('cyclomatic_score');
    expect(result).toHaveProperty('sanitized_length_delta');
    expect(result).toHaveProperty('entropy_score');
    expect(result).toHaveProperty('entropy_tail_delta');
    expect(result).toHaveProperty('entropy_tail_stripped_length');
  });

  it('returns non-negative numeric fields', () => {
    const result = triage('Debug the issue');
    expect(result.trivial_hits).toBeGreaterThanOrEqual(0);
    expect(result.complex_hits).toBeGreaterThanOrEqual(0);
    expect(result.cyclomatic_score).toBeGreaterThanOrEqual(0);
    expect(result.sanitized_length_delta).toBeGreaterThanOrEqual(0);
    expect(result.entropy_score).toBeGreaterThanOrEqual(0);
    expect(result.entropy_tail_stripped_length).toBeGreaterThanOrEqual(0);
  });
});

// ─── SP-154: Entropy tail anomaly detection ──────────────────────────────────

/** GCG-style high-entropy adversarial suffix (unique single-char tokens). */
function makeAdversarialSuffix(tokenCount = 24): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const tokens: string[] = [];
  for (let i = 0; i < tokenCount; i++) {
    tokens.push(chars[i % chars.length]! + String(i));
  }
  return tokens.join(' ');
}

describe('entropy tail check (SP-154)', () => {
  it('detects high normalized entropy on adversarial suffix tokens', () => {
    const tokens = tokenizeForEntropy(makeAdversarialSuffix(24));
    const entropy = normalizedTokenEntropy(tokens);
    expect(entropy).toBeGreaterThan(0.85);
  });

  it('strips high-entropy suffix appended to trivial prompt', () => {
    const suffix = makeAdversarialSuffix(24);
    const prompt = `Format this JSON file please review ${suffix}`;
    const result = checkEntropyTail(prompt);

    expect(result.anomaly_detected).toBe(true);
    expect(result.tail_stripped_length).toBeGreaterThan(0);
    expect(result.text).toContain('Format this JSON file');
    expect(result.text).not.toContain(suffix.slice(0, 8));
  });

  it('classifies trivial prompt correctly after adversarial suffix strip', () => {
    const suffix = makeAdversarialSuffix(24);
    const result = triage(`Format this JSON file ${suffix}`);
    expect(result.verdict).toBe('trivial');
    expect(result.reason_code).toBe('keyword_economical');
    expect(result.entropy_tail_stripped_length).toBeGreaterThan(0);
  });

  it('classifies complex prompt correctly after adversarial suffix strip', () => {
    const suffix = makeAdversarialSuffix(24);
    const result = triage(`Debug the memory leak in handler ${suffix}`);
    expect(result.verdict).toBe('complex');
    expect(result.reason_code).toBe('keyword_frontier');
    expect(result.entropy_tail_stripped_length).toBeGreaterThan(0);
  });

  it('does not strip normal English tail on typical prompts', () => {
    const normalPrompts = [
      'Format this JSON file',
      'Lint the codebase',
      'Debug the memory leak in the WebSocket handler',
      'Architect a distributed caching system',
      'Hello, how are you today?',
      'Refactor the authentication module',
      'Rename the variable from foo to bar',
    ];

    for (const prompt of normalPrompts) {
      const entropy = checkEntropyTail(prompt);
      expect(entropy.anomaly_detected, prompt).toBe(false);
      expect(entropy.tail_stripped_length, prompt).toBe(0);
      expect(entropy.text, prompt).toBe(prompt);
    }
  });

  it('preserves triage verdicts on normal prompts corpus sample', () => {
    const expectations: Array<[string, 'trivial' | 'complex' | 'ambiguous', string]> = [
      ['Format this JSON file', 'trivial', 'keyword_economical'],
      ['Lint the codebase', 'trivial', 'keyword_economical'],
      ['Debug the memory leak in the WebSocket handler', 'complex', 'keyword_frontier'],
      ['Architect a distributed caching system', 'complex', 'keyword_frontier'],
      ['Hello, how are you today?', 'ambiguous', 'no_fast_path'],
      ['Refactor the authentication module', 'complex', 'keyword_frontier'],
    ];

    for (const [prompt, verdict, reason] of expectations) {
      const result = triage(prompt);
      expect(result.verdict, prompt).toBe(verdict);
      expect(result.reason_code, prompt).toBe(reason);
      expect(result.entropy_tail_stripped_length, prompt).toBe(0);
    }
  });

  it('exports entropy metrics on every triage result', () => {
    const suffix = makeAdversarialSuffix(24);
    const result = triage(`Format this file ${suffix}`);
    expect(result.entropy_score).toBeGreaterThan(0);
    expect(result.entropy_tail_delta).toBeGreaterThan(0);
  });
});

// ─── T027/T028: Pipeline Triage Stage Integration ─────────────────────────────

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'test',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-triage-001',
    session_id: 'sess-triage',
    prompt_text: 'Hello world',
    ...overrides,
  };
}

const triageFleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

describe('Pipeline triage stage (T027, T028)', () => {
  describe('early exit on trivial prompt', () => {
    it('routes trivial prompt to economical-cloud model', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.reason_code).toBe('keyword_economical');
    });

    it('routes lint request to economical-cloud', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Lint the codebase' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('economical-cloud');
    });
  });

  describe('early exit on complex prompt', () => {
    it('routes complex prompt to frontier-cloud model', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Debug the memory leak in the WebSocket handler' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.selected_model_id).toBe('claude-opus');
      expect(decision.reason_code).toBe('keyword_frontier');
    });

    it('routes architecture request to frontier-cloud', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Architect a distributed caching system' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('frontier-cloud');
    });

    it('routes repo-cleanup fixture to frontier-cloud (SP-176)', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'help me clean up mistakenly added files in the repo',
        }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.reason_code).toBe('keyword_frontier');
    });
  });

  describe('pass-through on ambiguous prompt', () => {
    it('falls through to later stages for ambiguous prompt', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
    });

    it('falls through for empty prompt', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: '' }),
      );

      expect(decision.stage).toBe('fallback');
    });
  });

  describe('fallback when target tier unavailable', () => {
    it('passes through when no economical model in fleet for trivial prompt', async () => {
      const frontierOnly = [makeModel({ id: 'opus', tier: 'frontier-cloud' })];
      const pipeline = new RouterPipeline(frontierOnly);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this file' }),
      );

      expect(decision.stage).toBe('fallback');
    });

    it('passes through when no frontier model in fleet for complex prompt', async () => {
      const econOnly = [makeModel({ id: 'mini', tier: 'economical-cloud' })];
      const pipeline = new RouterPipeline(econOnly);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Debug the deadlock in concurrent writes' }),
      );

      expect(decision.stage).toBe('fallback');
    });

    it('skips unhealthy target-tier models', async () => {
      const fleet = [
        makeModel({ id: 'econ-sick', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-ok', tier: 'frontier-cloud' }),
      ];
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Rename the variable' }),
      );

      expect(decision.stage).toBe('fallback');
    });
  });

  describe('SC-004 latency budget (<5ms)', () => {
    it('completes triage routing within 5ms', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      // Warm JIT / module paths before timing (cold first route is flaky on CI hosts).
      await pipeline.route(makeRequest({ prompt_text: 'Format this JSON file' }));
      const start = performance.now();

      await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });

    it('completes complex triage within 5ms', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      await pipeline.route(
        makeRequest({ prompt_text: 'Debug the race condition in the worker pool' }),
      );
      const start = performance.now();

      await pipeline.route(
        makeRequest({ prompt_text: 'Debug the race condition in the worker pool' }),
      );

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });

    it('completes ambiguous pass-through within 5ms', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      await pipeline.route(makeRequest({ prompt_text: 'Hello, how are you?' }));
      const start = performance.now();

      await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you?' }),
      );

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe('preserves request context', () => {
    it('preserves request_id in triage decision', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ request_id: 'custom-id-123', prompt_text: 'Lint the code' }),
      );

      expect(decision.request_id).toBe('custom-id-123');
    });

    it('sets pin_reason to null for triage decisions', async () => {
      const pipeline = new RouterPipeline(triageFleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Refactor the authentication module' }),
      );

      expect(decision.pin_reason).toBeNull();
    });
  });
});
