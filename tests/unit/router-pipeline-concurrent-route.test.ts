// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/router-pipeline.ts single-flight route()
// serialization (SP-230, #141).
import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { SystemInfo } from '../../src/infrastructure/hardware/hardware-probe.js';
import {
  fleet,
  HARDWARE_CONFIG,
  makeModel,
  makeRequest,
  makeSystemInfo,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('concurrent route() safety (SP-230, #141)', () => {
    /** Deferred-gate probe: parks the first route() call inside hardware_probe. */
    function makeGatedProbe(events?: string[]) {
      let releaseFirstProbe!: () => void;
      let firstProbeStarted!: () => void;
      const firstProbeGate = new Promise<void>((resolve) => {
        releaseFirstProbe = resolve;
      });
      const started = new Promise<void>((resolve) => {
        firstProbeStarted = resolve;
      });
      let probeCalls = 0;

      const systemInfoProvider = async (): Promise<SystemInfo> => {
        probeCalls += 1;
        const call = probeCalls;
        events?.push(`probe-${call}:start`);
        if (call === 1) {
          firstProbeStarted();
          await firstProbeGate;
        }
        events?.push(`probe-${call}:end`);
        return makeSystemInfo();
      };

      return {
        systemInfoProvider,
        started,
        releaseFirstProbe: () => releaseFirstProbe(),
        getProbeCalls: () => probeCalls,
      };
    }

    it('serializes overlapping route() calls — the second queues behind the first', async () => {
      const events: string[] = [];
      const probe = makeGatedProbe(events);
      const pipeline = new RouterPipeline(fleet, {
        hardwareConfig: HARDWARE_CONFIG,
        systemInfoProvider: probe.systemInfoProvider,
      });

      const first = pipeline.route(
        makeRequest({
          request_id: '00000000-0000-0000-0000-0000000000a1',
          prompt_text: 'refactor auth layer',
        }),
      );
      await probe.started;

      const second = pipeline.route(
        makeRequest({
          request_id: '00000000-0000-0000-0000-0000000000b2',
          prompt_text: 'refactor auth layer',
        }),
      );

      // Flush timers/microtasks: the queued call must not have entered the pipeline.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(probe.getProbeCalls()).toBe(1);

      probe.releaseFirstProbe();
      const [firstDecision, secondDecision] = await Promise.all([first, second]);

      expect(events).toEqual([
        'probe-1:start',
        'probe-1:end',
        'probe-2:start',
        'probe-2:end',
      ]);
      expect(firstDecision.request_id).toBe('00000000-0000-0000-0000-0000000000a1');
      expect(secondDecision.request_id).toBe('00000000-0000-0000-0000-0000000000b2');
    });

    it('does not leak fleetOverride or per-route state across concurrent calls', async () => {
      const probe = makeGatedProbe();
      const pipeline = new RouterPipeline(fleet, {
        hardwareConfig: HARDWARE_CONFIG,
        systemInfoProvider: probe.systemInfoProvider,
      });

      const frontierAFleet = [makeModel({ id: 'frontier-a', tier: 'frontier-cloud' })];
      const frontierBFleet = [makeModel({ id: 'frontier-b', tier: 'frontier-cloud' })];

      const first = pipeline.route(
        makeRequest({ prompt_text: 'refactor auth layer' }),
        frontierAFleet,
      );
      await probe.started;

      // Start the second call while the first is parked inside the pipeline.
      // Without single-flight serialization, this call's route() reset swaps
      // the shared activeFleet mid-flight and the first call decides from
      // frontierBFleet — the cross-contamination reported in #141.
      const second = pipeline.route(
        makeRequest({ prompt_text: 'refactor auth layer' }),
        frontierBFleet,
      );

      probe.releaseFirstProbe();
      const [firstDecision, secondDecision] = await Promise.all([first, second]);

      expect(firstDecision.selected_model_id).toBe('frontier-a');
      expect(firstDecision.stage).toBe('triage');
      expect(secondDecision.selected_model_id).toBe('frontier-b');
      expect(secondDecision.stage).toBe('triage');
    });
  });
});
