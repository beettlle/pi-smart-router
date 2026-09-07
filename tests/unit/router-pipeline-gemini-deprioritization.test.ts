// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/routing/tool-history-guard.ts exercised via the pipeline.
import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import { makeModel, makeRequest } from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('gemini deprioritization (SP-080, narrowed SP-129)', () => {
    const geminiFirstFleet: ModelProfile[] = [
      makeModel({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
      makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
      makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
    ];

    const toolHistoryMessages = [
      {
        role: 'assistant' as const,
        content: 'calling tool',
        tool_blocks: [{ id: 'call-1', name: 'read', arguments: '{}' }],
      },
      { role: 'user' as const, content: 'continue' },
    ];

    it('does not deprioritize gemini for routing messages without Google-origin metadata', async () => {
      const pipeline = new RouterPipeline(geminiFirstFleet);
      const decision = await pipeline.route(
        makeRequest({ messages: toolHistoryMessages }),
      );

      expect(decision.selected_model_id).toBe('gemini-flash');
      expect(decision.stage).toBe('fallback');
    });

    it('still selects gemini when it is the only economical option', async () => {
      const geminiOnlyEconomical = [
        makeModel({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
        makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
      ];
      const pipeline = new RouterPipeline(geminiOnlyEconomical);
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'Fix the typo in the README',
          messages: toolHistoryMessages,
        }),
      );

      expect(decision.selected_model_id).toBe('gemini-flash');
      expect(decision.stage).toBe('triage');
    });

    it('does not reorder fleet without tool history', async () => {
      const pipeline = new RouterPipeline(geminiFirstFleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('gemini-flash');
    });

    it('skips deprioritization when force_model_id is set', async () => {
      const pipeline = new RouterPipeline(geminiFirstFleet);
      const decision = await pipeline.route(
        makeRequest({
          force_model_id: 'gemini-flash',
          messages: toolHistoryMessages,
        }),
      );

      expect(decision.selected_model_id).toBe('gemini-flash');
    });
  });
});
