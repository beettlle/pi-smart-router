/**
 * Hardware-probe stage (SP-274, #143 partial; moved out of the orchestrator
 * from the SP-272 inline PipelineStage).
 *
 * Behavior-preserving: probes hardware readiness (full_local / degraded /
 * disabled) and records it on the shared RoutingContext for local_zero
 * dispatch gating. Never decides.
 */

import { defaultHardwareProbePort } from '../ports/hardware-probe-port.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';

/** FR-001: probe hardware readiness before any tier decision. */
export function createHardwareProbeStage(): PipelineStage {
  return {
    name: 'hardware_probe',
    async run(context: RoutingContext): Promise<StageResult> {
      const hardwareConfig = context.options.hardwareConfig;
      const systemInfoProvider = context.options.systemInfoProvider;
      if (!hardwareConfig || !systemInfoProvider) {
        return { decided: false, stage: 'hardware_probe' };
      }

      const systemInfo = await systemInfoProvider();
      const probe = context.options.hardwareProbe ?? defaultHardwareProbePort;
      context.hardwareResult = probe.probe(hardwareConfig, systemInfo);
      return { decided: false, stage: 'hardware_probe' };
    },
  };
}
