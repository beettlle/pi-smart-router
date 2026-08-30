import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai/compat';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';

import type { HydraMatcher } from '../../../src/domain/matching/hydra-matcher.js';
import { ExecutionLedger } from '../../../src/domain/delegation/execution-ledger.js';
import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import type {
  AdaptiveReasoningConfig,
  ModelProfile,
  PlanningDelegateConfig,
  PriceCatalog,
  RoutingDecision,
  RoutingReasoningTelemetry,
  RoutingUsageActuals,
} from '../../../src/domain/types/index.js';
import type { PlanningDelegateSpawnFn } from './planning-delegate.js';
import type { StorePort } from '../../../src/domain/types/store-port.js';
import {
  DatasetRecorder,
} from '../../../src/infrastructure/telemetry/dataset-recorder.js';
import {
  OutcomeRecorder,
  type SessionRoutingSnapshot,
} from '../../../src/infrastructure/telemetry/outcome-recorder.js';
import {
  LifecycleHookState,
  type RouterHandle,
} from '../../../src/index.js';

export type FleetMode = 'scoped' | 'all';

export type SmartRouterCommand =
  | { command: 'status' }
  | { command: 'history'; limit: number }
  | { command: 'stats'; limit: number }
  | { command: 'mode'; mode: FleetMode }
  | { command: 'pricing'; subcommand: 'refresh' }
  | { command: 'export'; subcommand: 'dataset'; limit: number }
  | { command: 'export'; subcommand: 'telemetry-contrib'; limit: number }
  | { command: 'feedback'; rating: 'good' | 'bad' }
  | { command: 'unpin' };

/** Provider stream delegate; defaults to pi-ai streamSimple when omitted. */
export type DelegateStreamFn = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export interface StreamDelegationDeps {
  router: RouterHandle;
  modelRegistry: ModelRegistry;
  fleet: ModelProfile[];
  /** Cheap scope fingerprint check before each routed turn. */
  ensureFleetFresh?: () => Promise<void>;
  readonly executionLedger: ExecutionLedger;
  /**
   * Injectable stream override for tests; when unset, delegation resolves the
   * stream through `modelRegistry.getProvider(...)` (composed provider, which
   * knows extension-registered custom APIs — SP-238, #160), falling back to
   * pi-ai/compat `streamSimple` when no composed provider exists.
   */
  delegateStream?: DelegateStreamFn;
  /** Injectable planning delegate sub-call; production uses frontier stream delegate. */
  spawnPlanningDelegate?: PlanningDelegateSpawnFn;
  /** Planning delegate knobs incl. global + per-call timeout bounds (SP-213, #120). */
  readonly planningDelegateConfig?: PlanningDelegateConfig;
  /** Adaptive reasoning knobs: enable/disable + floor/ceiling (SP-246, #166). */
  readonly adaptiveReasoningConfig?: AdaptiveReasoningConfig;
  readonly lifecycleHookState?: LifecycleHookState;
  readonly datasetRecorder?: DatasetRecorder;
  readonly outcomeRecorder?: OutcomeRecorder;
  readonly sessionPinner?: SessionPinner;
  readonly sessionRouting?: Map<string, SessionRoutingSnapshot>;
  onRoutingDecision?: (decision: RoutingDecision) => void;
  /** Fired when a delegated provider stream completes successfully. */
  onDelegatedModel?: (model: {
    readonly provider: string;
    readonly id: string;
    /** Real limits of the delegated model, used to sync the registered auto entry. */
    readonly contextWindow?: number;
    readonly maxTokens?: number;
  }) => void;
  /**
   * Fired after a delegated stream ends with host-reported usage actuals
   * (SP-241, #164). Also fires on failed-with-usage terminals. Implementations
   * must not throw — actuals capture never fails the route.
   */
  onDelegationUsage?: (requestId: string, actuals: RoutingUsageActuals) => void;
  /**
   * Fired after the adaptive reasoning policy resolves the effective thinking
   * level for a delegated stream (SP-246, #166). Implementations must not
   * throw — reasoning telemetry must never fail the route.
   */
  onDelegationReasoning?: (requestId: string, fields: RoutingReasoningTelemetry) => void;
}

export interface SmartRouterRuntime {
  fleetMode: FleetMode;
  lastDecision: RoutingDecision | undefined;
  priceCatalog: PriceCatalog | null;
  /** Cached scope fingerprint; rebuild when this changes. */
  fleetScopeFingerprint?: string;
  /** Session cwd for ensureFleetFresh before routed turns. */
  sessionCwd?: string;
  modelRegistry: ModelRegistry;
  readonly store: StorePort;
  readonly sessionPinner: SessionPinner;
  readonly executionLedger: ExecutionLedger;
  readonly lifecycleHookState: LifecycleHookState;
  readonly datasetRecorder?: DatasetRecorder;
  readonly outcomeRecorder?: OutcomeRecorder;
  readonly sessionRouting: Map<string, SessionRoutingSnapshot>;
  streamDeps: StreamDelegationDeps;
  hydraMatcher: HydraMatcher | undefined;
  setLmuStatus?: (modelId: string) => void;
  clearLmuStatus?: () => void;
  notifyDatasetEnabled?: (message: string) => void;
  /**
   * Re-register the smart-router/auto model entry with the delegated model's real
   * context window / max output, so pi's footer and compaction use the actual
   * model limits instead of a hardcoded 200k (SP-092 fallback).
   */
  syncRegisteredLimits?: (limits: { contextWindow?: number; maxTokens?: number }) => void;
}
