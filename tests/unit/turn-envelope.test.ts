import { describe, expect, it } from 'vitest';

import { classifyTurnEnvelope } from '../../src/domain/triage/turn-envelope.js';
import type { Message } from '../../src/domain/types/index.js';

function msg(role: string, content: string): Message {
  return { role, content };
}

describe('classifyTurnEnvelope', () => {
  describe('unknown — empty or missing envelope', () => {
    it('returns unknown for undefined messages', () => {
      expect(classifyTurnEnvelope(undefined)).toBe('unknown');
    });

    it('returns unknown for empty messages array', () => {
      expect(classifyTurnEnvelope([])).toBe('unknown');
    });
  });

  describe('tool_result — last message role=tool', () => {
    it('classifies tool role message as tool_result', () => {
      const messages: Message[] = [
        msg('user', 'run the test'),
        msg('assistant', 'running tests now'),
        msg('tool', 'PASS 3/3 tests passed'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('tool_result');
    });

    it('classifies short tool content as tool_result', () => {
      const messages: Message[] = [
        msg('tool', '{"status":"ok"}'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('tool_result');
    });

    it('does not classify oversized tool content as tool_result', () => {
      const largeContent = 'x'.repeat(60_000);
      const messages: Message[] = [
        msg('tool', largeContent),
      ];
      expect(classifyTurnEnvelope(messages)).not.toBe('tool_result');
    });

    it('only checks the last message for tool role', () => {
      const messages: Message[] = [
        msg('tool', 'earlier tool result'),
        msg('user', 'thanks, now plan the next step'),
      ];
      expect(classifyTurnEnvelope(messages)).not.toBe('tool_result');
    });
  });

  describe('planning — architecture/planning signals', () => {
    it('detects "plan" keyword in user message', () => {
      const messages: Message[] = [
        msg('user', 'Create a plan for the database migration'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects "architecture" keyword', () => {
      const messages: Message[] = [
        msg('user', 'Review the architecture of the auth module'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects "design" keyword', () => {
      const messages: Message[] = [
        msg('assistant', 'Here is the design for the new API'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects step/phase markers', () => {
      const messages: Message[] = [
        msg('assistant', 'Step 1: Set up the project structure'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects markdown plan headers', () => {
      const messages: Message[] = [
        msg('assistant', '## Plan\n\n1. Refactor the module\n2. Add tests'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects "refactor" keyword', () => {
      const messages: Message[] = [
        msg('user', 'We need to refactor this component'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects planning in recent window (not just last)', () => {
      const messages: Message[] = [
        msg('user', 'skip this old message'),
        msg('user', 'outline the approach for migration'),
        msg('assistant', 'Here are the steps'),
        msg('user', 'looks good'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('does not detect planning outside the 3-message window', () => {
      const messages: Message[] = [
        msg('user', 'plan the entire architecture'),
        msg('assistant', 'done with the plan'),
        msg('user', 'now implement it'),
        msg('assistant', 'implementing now'),
        msg('user', 'how is it going'),
      ];
      expect(classifyTurnEnvelope(messages)).not.toBe('planning');
    });
  });

  describe('subagent — exploration/delegation signals', () => {
    it('detects "subagent" keyword', () => {
      const messages: Message[] = [
        msg('assistant', 'Launching a subagent to explore the codebase'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects "exploration" keyword', () => {
      const messages: Message[] = [
        msg('user', 'Use exploration to find the bug'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects "delegated" keyword', () => {
      const messages: Message[] = [
        msg('assistant', 'Task delegated to parallel agent'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects Task.create pattern', () => {
      const messages: Message[] = [
        msg('assistant', 'Called Task.create for the search'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects Agent.spawn pattern', () => {
      const messages: Message[] = [
        msg('assistant', 'Using Agent.spawn to handle this'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });
  });

  describe('main_loop — default agent turn', () => {
    it('classifies normal user/assistant exchange as main_loop', () => {
      const messages: Message[] = [
        msg('user', 'Fix the bug in auth.ts'),
        msg('assistant', 'I will fix the null check issue'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('classifies simple code request as main_loop', () => {
      const messages: Message[] = [
        msg('user', 'Add a comment to line 42'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('classifies generic conversation as main_loop', () => {
      const messages: Message[] = [
        msg('system', 'You are a helpful assistant'),
        msg('user', 'Hello'),
        msg('assistant', 'Hi there'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });
  });

  describe('priority ordering', () => {
    it('tool_result takes priority over planning signals in content', () => {
      const messages: Message[] = [
        msg('user', 'plan the architecture'),
        msg('tool', 'planning result: success'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('tool_result');
    });

    it('planning takes priority over subagent when both present', () => {
      const messages: Message[] = [
        msg('user', 'plan the subagent exploration architecture'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });
  });

  describe('performance — <2ms budget', () => {
    it('classifies within 2ms for typical message envelopes', () => {
      const messages: Message[] = [
        msg('system', 'You are a coding assistant'),
        msg('user', 'Implement the feature'),
        msg('assistant', 'Working on it now'),
      ];

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        classifyTurnEnvelope(messages);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      expect(perCall).toBeLessThan(2);
    });

    it('classifies within 2ms for large message envelopes', () => {
      const messages: Message[] = Array.from({ length: 50 }, (_, i) =>
        msg(i % 2 === 0 ? 'user' : 'assistant', `Message number ${i} with some content`),
      );

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        classifyTurnEnvelope(messages);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      expect(perCall).toBeLessThan(2);
    });
  });

  describe('edge cases', () => {
    it('handles single system message', () => {
      const messages: Message[] = [
        msg('system', 'You are an assistant'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('handles empty content strings', () => {
      const messages: Message[] = [
        msg('user', ''),
        msg('assistant', ''),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('is case-insensitive for keyword matching', () => {
      const messages: Message[] = [
        msg('user', 'PLANNING the ARCHITECTURE'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('does not false-positive on partial word matches', () => {
      const messages: Message[] = [
        msg('user', 'explaining the approach'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });
  });
});
