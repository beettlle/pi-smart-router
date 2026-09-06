// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/router-pipeline.ts dataset feature plumbing (SP-057).
import { describe, expect, it } from 'vitest';

import {
  HydraMatcher,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import {
  fleet,
  makeRequest,
  makeMockHydraProvider,
  UNTRAINED_P_SUCCESS_WEIGHTS,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('dataset feature sidecar (SP-057)', () => {
    it('attaches triage summary on fallback decisions', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Fix the typo in the README' }),
      );

      expect(decision.features).toBeDefined();
      expect(decision.features!.triage).toMatchObject({
        verdict: 'trivial',
        reason_code: expect.any(String),
        cyclomatic_score: expect.any(Number),
      });
      expect(decision.features!.requirements).toBeNull();
      expect(decision.features!.candidates).toBeNull();
      expect(JSON.stringify(decision.features)).not.toContain('Fix the typo');
    });

    it('includes triage summary when triage stage decides', async () => {
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Architect a distributed caching system' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.features!.triage).toMatchObject({
        verdict: 'complex',
        reason_code: 'keyword_frontier',
      });
    });

    it('retains HyDRA requirements and candidates when hydra_match runs', async () => {
      const requirements: RequirementVector = {
        reasoning: 0.5,
        code_gen: 0.5,
        tool_use: 0.5,
      };
      const hydraMatcher = new HydraMatcher(makeMockHydraProvider(requirements), {
        artifactCachePath: '.pi-smart-router/models/',
      });
      const pipeline = new RouterPipeline(fleet, {
        hydraMatcher,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.stage).toBe('hydra_match');
      expect(decision.features!.requirements).toEqual(requirements);
      expect(decision.features!.candidates).toEqual(decision.candidates ?? null);
      expect(decision.features!.triage).toMatchObject({ verdict: 'ambiguous' });
    });

    it('omits triage summary when session pin exits before triage', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });
      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('session_pin');
      expect(decision.features!.triage).toBeNull();
    });
  });
});
