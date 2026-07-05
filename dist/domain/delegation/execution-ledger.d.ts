/**
 * Tracks the last successfully executing model per session.
 *
 * Used to rewrite virtual smart-router assistant identity on replay so pi-ai
 * transformMessages sees the model that actually produced prior turns.
 */
import type { Api } from '@earendil-works/pi-ai/compat';
export interface ExecutionModel {
    readonly provider: string;
    readonly api: Api;
    readonly id: string;
}
export declare class ExecutionLedger {
    private readonly bySession;
    recordSuccess(sessionId: string, model: ExecutionModel): void;
    getLastExecution(sessionId: string): ExecutionModel | null;
    clear(sessionId: string): void;
}
//# sourceMappingURL=execution-ledger.d.ts.map