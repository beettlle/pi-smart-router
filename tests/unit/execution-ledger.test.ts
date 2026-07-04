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
});
