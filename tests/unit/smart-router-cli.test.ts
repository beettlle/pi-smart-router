import { describe, expect, it } from 'vitest';

import {
  executeUnpinCommand,
  isUnpinInvocation,
  UNPIN_SUBCOMMAND,
} from '../../src/cli/smart-router-cli.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';

describe('smart-router-cli unpin subcommand (SP-079)', () => {
  it('recognizes unpin invocation', () => {
    expect(isUnpinInvocation('unpin')).toBe(true);
    expect(isUnpinInvocation('  unpin  ')).toBe(true);
    expect(isUnpinInvocation('status')).toBe(false);
    expect(isUnpinInvocation('unpin all')).toBe(false);
    expect(UNPIN_SUBCOMMAND).toBe('unpin');
  });

  it('clears the current session pin', () => {
    const sessionPinner = new SessionPinner();
    const sessionId = 'sess-cli-unpin';
    sessionPinner.recordPin(sessionId, 'gpt-4o-mini', 'initial');

    const result = executeUnpinCommand({ sessionId, sessionPinner });

    expect(result).toEqual({
      outcome: 'cleared',
      previousModelId: 'gpt-4o-mini',
      message:
        'Cleared session pin (was gpt-4o-mini). Next request will run full routing.',
      level: 'info',
    });
    expect(sessionPinner.getPin(sessionId)).toBeNull();
  });

  it('no-ops when the session has no pin', () => {
    const sessionPinner = new SessionPinner();
    const sessionId = 'sess-cli-no-pin';

    const result = executeUnpinCommand({ sessionId, sessionPinner });

    expect(result).toEqual({
      outcome: 'noop',
      message: 'No session pin to clear.',
      level: 'info',
    });
  });

  it('reports unavailable when session pinner is missing', () => {
    const result = executeUnpinCommand({
      sessionId: 'sess-cli-missing-pinner',
      sessionPinner: undefined,
    });

    expect(result).toEqual({
      outcome: 'unavailable',
      message: 'Session pinner unavailable.',
      level: 'error',
    });
  });

  it('does not clear pins for other sessions', () => {
    const sessionPinner = new SessionPinner();
    sessionPinner.recordPin('sess-a', 'claude-opus', 'initial');
    sessionPinner.recordPin('sess-b', 'gpt-4o', 'initial');

    executeUnpinCommand({ sessionId: 'sess-a', sessionPinner });

    expect(sessionPinner.getPin('sess-a')).toBeNull();
    expect(sessionPinner.getPin('sess-b')?.pinned_model_id).toBe('gpt-4o');
  });
});
