/**
 * Switchcraft-style AST tool-call validation for benchmark profile ingest (SP-135).
 *
 * Validates function name and argument *structure* (key paths + JSON value types)
 * without exact string equality — paraphrase-tolerant for agent trace snippets.
 */

export const TOOL_CALL_VALIDATION_REASON_CODES = [
  'ok',
  'empty_snippet',
  'parse_failure',
  'missing_function_name',
  'invalid_arguments_json',
  'invalid_arguments_shape',
  'malformed_tool_call',
] as const;

export type ToolCallValidationReasonCode = (typeof TOOL_CALL_VALIDATION_REASON_CODES)[number];

export interface ToolCallValidationResult {
  readonly valid: boolean;
  readonly reasonCode: ToolCallValidationReasonCode;
  readonly detail?: string;
  /** Sorted key-path:type fingerprint when valid */
  readonly argumentStructure?: string;
  readonly functionName?: string;
}

/**
 * Tradeoff note for ingest script output — structure-only checks may accept
 * semantically wrong but well-formed tool calls (Switchcraft false-negative class).
 */
export const AST_VALIDATION_FALSE_NEGATIVE_NOTE =
  'AST validation checks function name and argument key/type shape only; semantically invalid but structurally valid calls may pass (false negatives possible).';

type JsonValueType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

interface NormalizedToolCall {
  readonly functionName: string;
  readonly arguments: Record<string, unknown> | null | undefined;
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function valueType(value: unknown): JsonValueType {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value as JsonValueType;
}

function parseArguments(raw: unknown): Record<string, unknown> | null | undefined {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw.trim());
    if (parsed === undefined) {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

function normalizeToolCall(value: unknown): NormalizedToolCall | null {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }
    return normalizeToolCall(value[0]);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const obj = value as Record<string, unknown>;

  if (Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
    return normalizeToolCall(obj.tool_calls[0]);
  }

  if (obj.function && typeof obj.function === 'object' && !Array.isArray(obj.function)) {
    const fn = obj.function as Record<string, unknown>;
    const name = fn.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      return null;
    }
    const args = parseArguments(fn.arguments);
    if (args === undefined) {
      return null;
    }
    return { functionName: name.trim(), arguments: args };
  }

  if (typeof obj.name === 'string' && obj.name.trim().length > 0) {
    const args = parseArguments(obj.arguments ?? obj.parameters);
    if (args === undefined) {
      return null;
    }
    return { functionName: obj.name.trim(), arguments: args };
  }

  if (typeof obj.function_name === 'string' && obj.function_name.trim().length > 0) {
    const args = parseArguments(obj.parameters ?? obj.arguments);
    if (args === undefined) {
      return null;
    }
    return { functionName: obj.function_name.trim(), arguments: args };
  }

  return null;
}

function extractJsonCandidates(snippet: string): unknown[] {
  const trimmed = snippet.trim();
  const candidates: unknown[] = [];
  const seen = new Set<string>();

  const pushCandidate = (value: unknown): void => {
    const key = JSON.stringify(value);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(value);
    }
  };

  const direct = tryParseJson(trimmed);
  if (direct !== undefined) {
    pushCandidate(direct);
  }

  const fenceRe = /```(?:json|tool_call)?\s*\n?([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRe.exec(trimmed)) !== null) {
    const inner = fenceMatch[1]?.trim();
    if (!inner) {
      continue;
    }
    const parsed = tryParseJson(inner);
    if (parsed !== undefined) {
      pushCandidate(parsed);
    }
  }

  const braceRe = /\{[\s\S]*\}/g;
  let braceMatch: RegExpExecArray | null;
  while ((braceMatch = braceRe.exec(trimmed)) !== null) {
    const parsed = tryParseJson(braceMatch[0] ?? '');
    if (parsed !== undefined) {
      pushCandidate(parsed);
    }
  }

  return candidates;
}

function buildArgumentStructureLines(
  obj: Record<string, unknown>,
  prefix = '',
): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const path = prefix.length > 0 ? `${prefix}.${key}` : key;
    const val = obj[key];
    const vt = valueType(val);
    lines.push(`${path}:${vt}`);
    if (vt === 'object' && val !== null && !Array.isArray(val)) {
      lines.push(...buildArgumentStructureLines(val as Record<string, unknown>, path));
    }
    if (vt === 'array' && Array.isArray(val) && val.length > 0) {
      lines.push(`${path}[]:${valueType(val[0])}`);
    }
  }
  return lines;
}

/** Structural fingerprint for argument objects — ignores literal string values. */
export function argumentStructureFingerprint(args: Record<string, unknown>): string {
  return buildArgumentStructureLines(args).join('|');
}

/**
 * Validate a representative tool-call snippet from agent traces or BFCL fixtures.
 * Accepts OpenAI-style tool_calls, direct `{name, arguments}`, and fenced JSON.
 */
export function validateToolCallAst(snippet: string): ToolCallValidationResult {
  if (!snippet || snippet.trim().length === 0) {
    return { valid: false, reasonCode: 'empty_snippet' };
  }

  const candidates = extractJsonCandidates(snippet);
  if (candidates.length === 0) {
    return {
      valid: false,
      reasonCode: 'parse_failure',
      detail: 'No parseable JSON tool-call object found',
    };
  }

  let sawMissingName = false;
  let sawBadArgsJson = false;
  let sawBadArgsShape = false;

  for (const candidate of candidates) {
    const normalized = normalizeToolCall(candidate);
    if (!normalized) {
      continue;
    }

    if (normalized.functionName.length === 0) {
      sawMissingName = true;
      continue;
    }

    if (normalized.arguments === null) {
      sawBadArgsJson = true;
      continue;
    }

    if (normalized.arguments === undefined) {
      sawBadArgsShape = true;
      continue;
    }

    const argumentStructure = argumentStructureFingerprint(normalized.arguments);
    return {
      valid: true,
      reasonCode: 'ok',
      functionName: normalized.functionName,
      argumentStructure,
    };
  }

  if (sawBadArgsJson) {
    return {
      valid: false,
      reasonCode: 'invalid_arguments_json',
      detail: 'Tool-call arguments string is not valid JSON',
    };
  }

  if (sawBadArgsShape) {
    return {
      valid: false,
      reasonCode: 'invalid_arguments_shape',
      detail: 'Tool-call arguments must be a JSON object',
    };
  }

  if (sawMissingName) {
    return { valid: false, reasonCode: 'missing_function_name' };
  }

  return {
    valid: false,
    reasonCode: 'malformed_tool_call',
    detail: 'Unrecognized tool-call object shape',
  };
}
