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
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
} from '../../../src/domain/types/index.js';
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
  /** Injectable for tests; production uses pi-ai streamSimple. */
  delegateStream?: DelegateStreamFn;
  readonly lifecycleHookState?: LifecycleHookState;
  readonly datasetRecorder?: DatasetRecorder;
  readonly outcomeRecorder?: OutcomeRecorder;
  readonly sessionPinner?: SessionPinner;
  readonly sessionRouting?: Map<string, SessionRoutingSnapshot>;
  onRoutingDecision?: (decision: RoutingDecision) => void;
  /** Fired when a delegated provider stream completes successfully. */
  onDelegatedModel?: (model: { readonly provider: string; readonly id: string }) => void;
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
}
