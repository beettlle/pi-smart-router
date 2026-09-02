import { describe, expect, it } from 'vitest';

import { evictInMemorySessionState } from '../../src/api/session-eviction.js';
import { LifecycleHookState } from '../../src/api/middleware/pi-router-middleware.js';
import { ExecutionLedger } from '../../src/domain/delegation/execution-ledger.js';

describe('evictInMemorySessionState', () => {
  it('clears ledger, lifecycle, and sessionRouting entries for the session', () => {
    const executionLedger = new ExecutionLedger();
    const lifecycleHookState = new LifecycleHookState();
    const sessionRouting = new Map<string, unknown>();

    executionLedger.recordSuccess('sess-1', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });
    lifecycleHookState.markCompaction('sess-1');
    lifecycleHookState.setForceModel('sess-1', 'claude-3');
    sessionRouting.set('sess-1', { decision: 'cloud-frontier' });

    evictInMemorySessionState('sess-1', {
      executionLedger,
      lifecycleHookState,
      sessionRouting,
    });

    expect(executionLedger.getLastExecution('sess-1')).toBeNull();
    expect(lifecycleHookState.has('sess-1')).toBe(false);
    expect(lifecycleHookState.consume('sess-1')).toEqual({});
    expect(sessionRouting.has('sess-1')).toBe(false);
  });

  it('evicts only the target session across all maps', () => {
    const executionLedger = new ExecutionLedger();
    const lifecycleHookState = new LifecycleHookState();
    const sessionRouting = new Map<string, unknown>();

    for (const sessionId of ['sess-1', 'sess-2']) {
      executionLedger.recordSuccess(sessionId, {
        provider: 'google',
        api: 'google-generative-ai',
        id: 'gemini-2.5-flash',
      });
      lifecycleHookState.markCompaction(sessionId);
      sessionRouting.set(sessionId, { decision: 'local' });
    }

    evictInMemorySessionState('sess-1', {
      executionLedger,
      lifecycleHookState,
      sessionRouting,
    });

    expect(executionLedger.getLastExecution('sess-1')).toBeNull();
    expect(lifecycleHookState.has('sess-1')).toBe(false);
    expect(sessionRouting.has('sess-1')).toBe(false);

    expect(executionLedger.getLastExecution('sess-2')?.id).toBe('gemini-2.5-flash');
    expect(lifecycleHookState.has('sess-2')).toBe(true);
    expect(sessionRouting.has('sess-2')).toBe(true);
  });

  it('works without a sessionRouting map', () => {
    const executionLedger = new ExecutionLedger();
    const lifecycleHookState = new LifecycleHookState();

    executionLedger.recordSuccess('sess-1', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });
    lifecycleHookState.markCompaction('sess-1');

    evictInMemorySessionState('sess-1', { executionLedger, lifecycleHookState });

    expect(executionLedger.getLastExecution('sess-1')).toBeNull();
    expect(lifecycleHookState.has('sess-1')).toBe(false);
  });

  it('is idempotent for unknown or already-evicted session ids', () => {
    const executionLedger = new ExecutionLedger();
    const lifecycleHookState = new LifecycleHookState();
    const sessionRouting = new Map<string, unknown>();

    evictInMemorySessionState('never-seen', {
      executionLedger,
      lifecycleHookState,
      sessionRouting,
    });
    evictInMemorySessionState('never-seen', {
      executionLedger,
      lifecycleHookState,
      sessionRouting,
    });

    expect(executionLedger.getLastExecution('never-seen')).toBeNull();
    expect(lifecycleHookState.has('never-seen')).toBe(false);
    expect(sessionRouting.has('never-seen')).toBe(false);
  });
});
