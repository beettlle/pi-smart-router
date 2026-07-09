import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  argumentStructureFingerprint,
  AST_VALIDATION_FALSE_NEGATIVE_NOTE,
  validateToolCallAst,
} from '../../scripts/lib/ast-tool-validation.js';

const FIXTURES_DIR = join('tests', 'fixtures', 'tool-call-samples');

function loadSample(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

describe('ast-tool-validation (SP-135)', () => {
  it('accepts OpenAI-style function tool calls from fixtures', () => {
    const result = validateToolCallAst(loadSample('openai-read.json'));
    expect(result.valid).toBe(true);
    expect(result.reasonCode).toBe('ok');
    expect(result.functionName).toBe('read');
    expect(result.argumentStructure).toBe('path:string');
  });

  it('accepts direct name/arguments objects', () => {
    const result = validateToolCallAst(loadSample('direct-bash.json'));
    expect(result.valid).toBe(true);
    expect(result.functionName).toBe('bash');
    expect(result.argumentStructure).toBe('command:string');
  });

  it('extracts tool_calls from assistant message envelopes', () => {
    const result = validateToolCallAst(loadSample('message-with-tool-calls.json'));
    expect(result.valid).toBe(true);
    expect(result.functionName).toBe('grep');
    expect(result.argumentStructure).toBe('path:string|pattern:string');
  });

  it('rejects malformed argument JSON with reason code', () => {
    const result = validateToolCallAst(loadSample('malformed-arguments.json'));
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('invalid_arguments_json');
  });

  it('rejects empty snippets', () => {
    expect(validateToolCallAst('').reasonCode).toBe('empty_snippet');
    expect(validateToolCallAst('   ').reasonCode).toBe('empty_snippet');
  });

  it('rejects unparseable snippets', () => {
    const result = validateToolCallAst('this is not json at all');
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('parse_failure');
  });

  it('rejects tool calls missing function name', () => {
    const result = validateToolCallAst(JSON.stringify({ arguments: { x: 1 } }));
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe('malformed_tool_call');
  });

  it('is paraphrase-tolerant for argument literal values', () => {
    const a = validateToolCallAst(
      JSON.stringify({ name: 'bash', arguments: { command: 'ls -la /tmp' } }),
    );
    const b = validateToolCallAst(
      JSON.stringify({ name: 'bash', arguments: { command: 'pwd && ls -la /var/log' } }),
    );
    expect(a.valid).toBe(true);
    expect(b.valid).toBe(true);
    expect(a.argumentStructure).toBe(b.argumentStructure);
  });

  it('accepts fenced JSON snippets with different whitespace', () => {
    const snippet = `\`\`\`json
{
  "function_name": "write",
  "parameters": {
    "path": "out.txt",
    "contents": "hello"
  }
}
\`\`\``;
    const result = validateToolCallAst(snippet);
    expect(result.valid).toBe(true);
    expect(result.functionName).toBe('write');
    expect(result.argumentStructure).toBe('contents:string|path:string');
  });

  it('builds nested argument structure fingerprints', () => {
    const structure = argumentStructureFingerprint({
      options: { recursive: true, limit: 10 },
      target: 'src',
    });
    expect(structure).toBe('options:object|options.limit:number|options.recursive:boolean|target:string');
  });

  it('documents false-negative tradeoff for operators', () => {
    expect(AST_VALIDATION_FALSE_NEGATIVE_NOTE).toMatch(/false negative/i);
  });
});
