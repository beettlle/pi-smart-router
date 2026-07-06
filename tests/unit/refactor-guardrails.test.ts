import { describe, expect, it } from 'vitest';

import {
  EPIC_REFACTOR_DETECTED,
  EPIC_REFACTOR_GUARDRAILS,
  EPIC_REFACTOR_NOT_DETECTED,
  EPIC_REFACTOR_RECOMMENDED_TIER,
  collectEpicRefactorScopeSignals,
  evaluateEpicRefactorGuardrails,
  isEpicRefactorScope,
} from '../../src/domain/refactor-guardrails.js';
import type { RoutingRequest } from '../../src/domain/types/index.js';

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-epic-1',
    session_id: 'sess-epic-1',
    prompt_text: 'hello',
    ...overrides,
  };
}

describe('refactor guardrails (SP-083)', () => {
  it('is inert for normal prompts', () => {
    const evaluation = evaluateEpicRefactorGuardrails(
      makeRequest({ prompt_text: 'fix the typo in README.md' }),
    );

    expect(evaluation.is_epic).toBe(false);
    expect(evaluation.reason_code).toBe(EPIC_REFACTOR_NOT_DETECTED);
    expect(evaluation.guardrails).toEqual([]);
    expect(evaluation.recommended_tier).toBeUndefined();
  });

  it('detects epic refactor from multiple scope keywords', () => {
    const evaluation = evaluateEpicRefactorGuardrails(
      makeRequest({
        prompt_text:
          'Plan a large refactor to decompose the extension god file into modules.',
      }),
    );

    expect(evaluation.is_epic).toBe(true);
    expect(evaluation.reason_code).toBe(EPIC_REFACTOR_DETECTED);
    expect(evaluation.guardrails).toEqual(EPIC_REFACTOR_GUARDRAILS);
    expect(evaluation.recommended_tier).toBe(EPIC_REFACTOR_RECOMMENDED_TIER);
  });

  it('detects epic refactor when many files are mentioned with a keyword', () => {
    const evaluation = evaluateEpicRefactorGuardrails(
      makeRequest({
        prompt_text: [
          'Restructure these modules:',
          'src/domain/pipeline/router-pipeline.ts',
          'src/domain/triage/triage-engine.ts',
          'src/domain/pinning/session-pinner.ts',
        ].join('\n'),
      }),
    );

    expect(evaluation.is_epic).toBe(true);
    expect(evaluation.signals.file_path_mentions).toBeGreaterThanOrEqual(3);
  });

  it('detects epic refactor for planning turns with complex embedded code', () => {
    const branches = Array.from(
      { length: 16 },
      (_, i) => `  if (x === ${i}) { return ${i}; }`,
    ).join('\n');
    const code = `\`\`\`ts\nfunction f(x: number) {\n${branches}\n}\n\`\`\``;

    const evaluation = evaluateEpicRefactorGuardrails(
      makeRequest({
        turn_type: 'planning',
        prompt_text: `Restructure plan for the routing pipeline:\n${code}`,
      }),
    );

    expect(evaluation.is_epic).toBe(true);
    expect(evaluation.signals.planning_turn).toBe(true);
    expect(evaluation.signals.cyclomatic_score).toBeGreaterThanOrEqual(15);
  });

  it('does not flag a single-keyword prompt without supporting scope', () => {
    const signals = collectEpicRefactorScopeSignals(
      makeRequest({ prompt_text: 'Please refactor this helper function.' }),
    );

    expect(isEpicRefactorScope(signals)).toBe(false);
  });

  it('emits spine decomposition, test gate, and frontier routing guardrails', () => {
    const evaluation = evaluateEpicRefactorGuardrails(
      makeRequest({
        prompt_text: 'Epic refactor: decompose the god file across the codebase.',
      }),
    );

    expect(evaluation.guardrails).toContain('spine_decomposition');
    expect(evaluation.guardrails).toContain('test_gate');
    expect(evaluation.guardrails).toContain('frontier_routing');
  });
});
