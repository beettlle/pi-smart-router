import { describe, expect, it } from 'vitest';

import { ExecutionLedger } from '../../src/domain/delegation/execution-ledger.js';

describe('ExecutionLedger', () => {
  it('records and retrieves last execution model per session', () => {
    const ledger = new ExecutionLedger();

    ledger.recordSuccess('sess-1', {
      provider: 'google',
      api: 'google-generative-ai',
      id: 'gemini-2.5-flash',
    });

    expect(ledger.getLastExecution('sess-1')).toEqual({
      provider: 'google',
      api: 'google-generative-ai',
      id: 'gemini-2.5-flash',
    });
    expect(ledger.getLastExecution('sess-2')).toBeNull();
  });

  it('overwrites prior execution on subsequent success', () => {
    const ledger = new ExecutionLedger();

    ledger.recordSuccess('sess-1', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });
    ledger.recordSuccess('sess-1', {
      provider: 'google',
      api: 'google-generative-ai',
      id: 'gemini-2.5-flash',
    });

    expect(ledger.getLastExecution('sess-1')?.id).toBe('gemini-2.5-flash');
  });

  it('clears session execution', () => {
    const ledger = new ExecutionLedger();
    ledger.recordSuccess('sess-1', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });

    ledger.clear('sess-1');
    expect(ledger.getLastExecution('sess-1')).toBeNull();
  });

  it('clear only evicts the target session', () => {
    const ledger = new ExecutionLedger();
    ledger.recordSuccess('sess-1', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });
    ledger.recordSuccess('sess-2', {
      provider: 'google',
      api: 'google-generative-ai',
      id: 'gemini-2.5-flash',
    });

    ledger.clear('sess-1');

    expect(ledger.getLastExecution('sess-1')).toBeNull();
    expect(ledger.getLastExecution('sess-2')?.id).toBe('gemini-2.5-flash');
  });

  it('clear is a no-op for unknown session ids', () => {
    const ledger = new ExecutionLedger();
    expect(() => ledger.clear('never-seen')).not.toThrow();
  });
});
