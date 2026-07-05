/**
 * Delegation context normalization — provider-agnostic replay identity fix.
 *
 * pi-ai transformMessages compares assistant message provider/api/model to the
 * target model. Virtual smart-router tags break isSameModel and strip replay
 * state (thoughtSignature, thinkingSignature, etc.).
 */
import type { Api, Context, Message, Model } from '@earendil-works/pi-ai/compat';
import type { ExecutionModel } from './execution-ledger.js';
export declare const VIRTUAL_ROUTER_PROVIDER: "smart-router";
export declare const VIRTUAL_ROUTER_MODEL_ID: "auto";
export declare function isVirtualRouterIdentity(provider: string, modelId: string): boolean;
export declare function hasReplaySensitiveState(messages: readonly Message[]): boolean;
export interface NormalizeDelegationContextOptions {
    readonly virtualProvider?: typeof VIRTUAL_ROUTER_PROVIDER;
    readonly sessionExecution?: ExecutionModel | null;
}
/**
 * Rewrite assistant messages tagged with the virtual router to the executing
 * model identity pi-ai expects for same-model replay.
 */
export declare function normalizeDelegationContext<TApi extends Api>(context: Context, targetModel: Model<TApi>, options?: NormalizeDelegationContextOptions): Context;
//# sourceMappingURL=delegation-context.d.ts.map
