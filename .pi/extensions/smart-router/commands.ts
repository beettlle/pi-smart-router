export const SMART_ROUTER_USAGE =
  '/smart-router [status] | mode scoped|all | pricing refresh';

type CompletionItem = { value: string; label: string };

const TOP_LEVEL: CompletionItem[] = [
  { value: 'status', label: 'Show last routing decision' },
  { value: 'mode', label: 'Switch fleet mode (scoped or all)' },
  { value: 'pricing', label: 'Manage pricing catalog' },
];

const MODE_COMPLETIONS: CompletionItem[] = [
  { value: 'mode scoped', label: 'Route among scoped models only' },
  { value: 'mode all', label: 'Route among all authenticated models' },
];

const PRICING_COMPLETIONS: CompletionItem[] = [
  { value: 'pricing refresh', label: 'Fetch LiteLLM rates and rebuild fleet' },
];

/** Full invocations used to keep completions and parseSmartRouterArgs in sync. */
export const SMART_ROUTER_FULL_INVOCATIONS = [
  '',
  'status',
  'mode scoped',
  'mode all',
  'pricing refresh',
] as const;

function filterByPrefix(items: CompletionItem[], prefix: string): CompletionItem[] {
  return items.filter((item) => item.value.startsWith(prefix));
}

export function getSmartRouterArgumentCompletions(prefix: string): CompletionItem[] | null {
  const trimmed = prefix.trimStart();
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  if (tokens[0] === 'mode') {
    const subPrefix = tokens.slice(1).join(' ');
    const filtered = filterByPrefix(MODE_COMPLETIONS, `mode${subPrefix ? ` ${subPrefix}` : ''}`);
    return filtered.length > 0 ? filtered : null;
  }

  if (tokens[0] === 'pricing') {
    const subPrefix = tokens.slice(1).join(' ');
    const filtered = filterByPrefix(PRICING_COMPLETIONS, `pricing${subPrefix ? ` ${subPrefix}` : ''}`);
    return filtered.length > 0 ? filtered : null;
  }

  const firstToken = tokens[0] ?? '';
  const filtered = filterByPrefix(TOP_LEVEL, firstToken);
  return filtered.length > 0 ? filtered : null;
}
