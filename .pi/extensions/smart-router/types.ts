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
  | { command: 'feedback'; rating: 'good' | 'bad' };

export interface StreamDelegationDeps {
  router: RouterHandle;
  readonly modelRegistry: ModelRegistry;
  fleet: ModelProfile[];
  readonly executionLedger: ExecutionLedger;
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
  readonly modelRegistry: ModelRegistry;
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
