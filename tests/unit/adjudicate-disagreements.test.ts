/**
 * Unit tests for panel disagreement adjudication (close #168).
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PASS_SCORE,
  DEFAULT_SEED,
  assignSessionHoldout,
  type AdversarialTask,
  type GeneratorClient,
  type GraderClient,
} from '../../scripts/calibration/adversarial-label-campaign.js';
import {
  PANEL_ADJUDICATION_SIGNAL,
  PANEL_MAJORITY_SIGNAL,
  appendPackRowsDeduped,
  buildAdjudicatedRow,
  buildAdjudicatedSampleId,
  loadDisagreementsFromReport,
  majorityDecision,
  parseAdjudicateArgs,
  runAdjudication,
  selectPanelForGenerator,
} from '../../scripts/calibration/adjudicate-disagreements.js';
import {
  parsePiCliClientSpec,
  type PiModelRef,
} from '../../scripts/calibration/pi-cli-clients.js';

function task(overrides?: Partial<AdversarialTask>): AdversarialTask {
  return {
    taskId: 'task-1',
    sessionId: 'sess-1',
    promptText: 'Do the thing.',
    tier: 'economical-cloud',
    features: {
      prompt_length_norm: 0.1,
      estimated_input_tokens_norm: 0.05,
      triage_cyclomatic_score: 0.2,
      requirement_reasoning: 0.3,
      requirement_code_gen: 0.2,
      requirement_tool_use: 0,
      has_tool_context: 0,
      compaction_flag: 0,
      routing_latency_norm: 0.1,
      economical_tier: 1,
    },
    ...overrides,
  };
}

function fakeGenerator(id: string, response: string): GeneratorClient {
  return {
    id,
    async generate(): Promise<string> {
      return response;
    },
  };
}

function fakeGrader(id: string, score: number | (() => number)): GraderClient {
  return {
    id,
    async grade(): Promise<number> {
      return typeof score === 'function' ? score() : score;
    },
  };
}

function failingGrader(id: string): GraderClient {
  return {
    id,
    async grade(): Promise<number> {
      throw new Error('unparseable');
    },
  };
}

const PANEL_POOL: PiModelRef[] = [
  parsePiCliClientSpec('panel-glm=zai/glm-5.3'),
  parsePiCliClientSpec('panel-kimi=kimi-coding/k3'),
  parsePiCliClientSpec('panel-pro=google/gemini-3.1-pro-preview'),
];

const PANEL_FILL: PiModelRef[] = [
  parsePiCliClientSpec('panel-fill-0=google/gemini-flash-lite-latest'),
  parsePiCliClientSpec('panel-fill-1=zai/glm-5.3-flash'),
];

describe('adjudicate-disagreements', () => {
  it('selectPanelForGenerator excludes generator model and fills alternate', () => {
    const panel = selectPanelForGenerator(
      'google/gemini-3.1-pro-preview',
      PANEL_POOL,
      PANEL_FILL,
    );
    expect(panel).toHaveLength(3);
    expect(panel.every((r) => r.providerModel !== 'google/gemini-3.1-pro-preview')).toBe(
      true,
    );
    expect(panel.map((r) => r.id)).toContain('panel-fill-0');
    expect(panel.map((r) => r.providerModel)).toEqual([
      'zai/glm-5.3',
      'kimi-coding/k3',
      'google/gemini-flash-lite-latest',
    ]);
  });

  it('majorityDecision requires ≥2 agreeing pass/fail votes', () => {
    expect(majorityDecision({ a: 9, b: 8, c: 2 }, DEFAULT_PASS_SCORE)).toEqual({
      success: true,
      judgeScore: 6.3,
    });
    expect(majorityDecision({ a: 1, b: 2, c: 9 }, DEFAULT_PASS_SCORE)).toEqual({
      success: false,
      judgeScore: 4,
    });
    expect(majorityDecision({ a: 9, b: 2 }, DEFAULT_PASS_SCORE)).toBeNull();
    expect(majorityDecision({ a: 9 }, DEFAULT_PASS_SCORE)).toBeNull();
  });

  it('runAdjudication majority 2–1 emits panel_adjudication row', async () => {
    const t = task();
    const result = await runAdjudication({
      disagreements: [
        {
          taskId: t.taskId,
          generatorId: 'gen-0',
          graderScores: { 'grader-0': 9, 'grader-1': 2 },
        },
      ],
      tasksById: new Map([[t.taskId, t]]),
      generators: new Map([['gen-0', fakeGenerator('gen-0', 'ok response')]]),
      generatorModels: new Map([['gen-0', 'google/gemini-3.1-pro-preview']]),
      panelPool: PANEL_POOL,
      panelFill: PANEL_FILL,
      panelGraders: new Map([
        ['panel-glm', fakeGrader('panel-glm', 9)],
        ['panel-kimi', fakeGrader('panel-kimi', 8)],
        ['panel-pro', fakeGrader('panel-pro', 0)],
        ['panel-fill-0', fakeGrader('panel-fill-0', 1)],
        ['panel-fill-1', fakeGrader('panel-fill-1', 1)],
      ]),
      seed: DEFAULT_SEED,
      holdoutPercent: 20,
      passScore: DEFAULT_PASS_SCORE,
    });

    expect(result.residual).toHaveLength(0);
    expect(result.resolved).toHaveLength(1);
    expect(result.generations).toHaveLength(1);
    const row = result.resolved[0]!.row;
    expect(row.success).toBe(true);
    expect(row.outcome_signals).toContain(PANEL_ADJUDICATION_SIGNAL);
    expect(row.outcome_signals).toContain(PANEL_MAJORITY_SIGNAL);
    expect(row.outcome_signals).toContain('llm_judge');
    expect(row.sample_id).toBe(buildAdjudicatedSampleId(t.taskId, 'gen-0'));
    // Generator model excluded → fill used instead of panel-pro.
    expect(result.resolved[0]!.panelistScores).toHaveProperty('panel-fill-0');
    expect(result.resolved[0]!.panelistScores).not.toHaveProperty('panel-pro');
  });

  it('empty regeneration becomes residual without inventing a row', async () => {
    const t = task();
    const result = await runAdjudication({
      disagreements: [
        {
          taskId: t.taskId,
          generatorId: 'gen-0',
          graderScores: { a: 1, b: 9 },
        },
      ],
      tasksById: new Map([[t.taskId, t]]),
      generators: new Map([['gen-0', fakeGenerator('gen-0', '   ')]]),
      generatorModels: new Map([['gen-0', 'google/gemini-3.1-pro-preview']]),
      panelPool: PANEL_POOL,
      panelFill: PANEL_FILL,
      panelGraders: new Map([
        ['panel-glm', fakeGrader('panel-glm', 9)],
        ['panel-kimi', fakeGrader('panel-kimi', 9)],
        ['panel-fill-0', fakeGrader('panel-fill-0', 9)],
      ]),
    });
    expect(result.resolved).toHaveLength(0);
    expect(result.residual).toHaveLength(1);
    expect(result.residual[0]!.reason).toMatch(/empty regenerated/);
  });

  it('all panelists failing becomes residual', async () => {
    const t = task();
    const result = await runAdjudication({
      disagreements: [
        {
          taskId: t.taskId,
          generatorId: 'gen-1',
          graderScores: { a: 0, b: 9 },
        },
      ],
      tasksById: new Map([[t.taskId, t]]),
      generators: new Map([['gen-1', fakeGenerator('gen-1', 'text')]]),
      generatorModels: new Map([['gen-1', 'kimi-coding/k3']]),
      panelPool: PANEL_POOL,
      panelFill: PANEL_FILL,
      panelGraders: new Map([
        ['panel-glm', failingGrader('panel-glm')],
        ['panel-kimi', failingGrader('panel-kimi')],
        ['panel-pro', failingGrader('panel-pro')],
        ['panel-fill-0', failingGrader('panel-fill-0')],
        ['panel-fill-1', failingGrader('panel-fill-1')],
      ]),
    });
    expect(result.resolved).toHaveLength(0);
    expect(result.residual[0]!.reason).toMatch(/all panelists failed/);
  });

  it('reuses stored generations instead of regenerating', async () => {
    const t = task();
    let generateCalls = 0;
    const generator: GeneratorClient = {
      id: 'gen-0',
      generate: async () => {
        generateCalls += 1;
        return 'should-not-run';
      },
    };
    const stored = new Map([
      [
        'task-1|gen-0',
        {
          kind: 'generation' as const,
          task_id: 'task-1',
          client_id: 'gen-0',
          response_text: 'stored response text',
          provider_model: 'google/gemini-3.1-pro-preview',
        },
      ],
    ]);
    const result = await runAdjudication({
      disagreements: [
        {
          taskId: t.taskId,
          generatorId: 'gen-0',
          graderScores: { 'grader-0': 9, 'grader-1': 2 },
        },
      ],
      tasksById: new Map([[t.taskId, t]]),
      generators: new Map([['gen-0', generator]]),
      generatorModels: new Map([['gen-0', 'google/gemini-3.1-pro-preview']]),
      panelPool: PANEL_POOL,
      panelFill: PANEL_FILL,
      panelGraders: new Map([
        ['panel-glm', fakeGrader('panel-glm', 9)],
        ['panel-kimi', fakeGrader('panel-kimi', 8)],
        ['panel-pro', fakeGrader('panel-pro', 0)],
        ['panel-fill-0', fakeGrader('panel-fill-0', 1)],
        ['panel-fill-1', fakeGrader('panel-fill-1', 1)],
      ]),
      storedGenerations: stored,
    });
    expect(generateCalls).toBe(0);
    expect(result.resolved).toHaveLength(1);
    expect(result.generations[0]!.response_text).toBe('stored response text');
  });

  it('requireStoredGenerations residuals when key missing', async () => {
    const t = task();
    const result = await runAdjudication({
      disagreements: [
        {
          taskId: t.taskId,
          generatorId: 'gen-0',
          graderScores: { a: 1, b: 9 },
        },
      ],
      tasksById: new Map([[t.taskId, t]]),
      generators: new Map([['gen-0', fakeGenerator('gen-0', 'new')]]),
      generatorModels: new Map([['gen-0', 'google/gemini-3.1-pro-preview']]),
      panelPool: PANEL_POOL,
      panelFill: PANEL_FILL,
      panelGraders: new Map([
        ['panel-glm', fakeGrader('panel-glm', 9)],
        ['panel-kimi', fakeGrader('panel-kimi', 8)],
        ['panel-pro', fakeGrader('panel-pro', 0)],
        ['panel-fill-0', fakeGrader('panel-fill-0', 1)],
        ['panel-fill-1', fakeGrader('panel-fill-1', 1)],
      ]),
      storedGenerations: new Map(),
      requireStoredGenerations: true,
    });
    expect(result.resolved).toHaveLength(0);
    expect(result.residual[0]!.reason).toMatch(/stored generation missing/);
  });

  it('appendPackRowsDeduped skips existing sample_ids on re-run', () => {
    const t = task();
    const holdout = assignSessionHoldout(t.sessionId, DEFAULT_SEED, 20);
    const row = buildAdjudicatedRow({
      task: t,
      generatorId: 'gen-0',
      panelistIds: ['panel-glm', 'panel-kimi', 'panel-fill-0'],
      success: true,
      judgeScore: 8,
      holdout,
    });
    const resolved = [
      {
        taskId: t.taskId,
        generatorId: 'gen-0',
        generatorProviderModel: 'google/gemini-3.1-pro-preview',
        panelistScores: { 'panel-glm': 9, 'panel-kimi': 8, 'panel-fill-0': 7 },
        panelistModels: {},
        success: true,
        judgeScore: 8,
        partition: holdout ? ('holdout' as const) : ('fit' as const),
        row,
      },
    ];

    const first = appendPackRowsDeduped([], [], resolved);
    expect(first.fitAppended + first.holdoutAppended).toBe(1);

    const second = appendPackRowsDeduped(first.fit, first.holdout, resolved);
    expect(second.fitAppended).toBe(0);
    expect(second.holdoutAppended).toBe(0);
    expect(second.fit.length + second.holdout.length).toBe(1);
  });

  it('holdout partition matches assignSessionHoldout', async () => {
    const t = task({ sessionId: 'sess-holdout-probe' });
    const expectedHoldout = assignSessionHoldout(t.sessionId, DEFAULT_SEED, 20);
    const result = await runAdjudication({
      disagreements: [
        {
          taskId: t.taskId,
          generatorId: 'gen-0',
          graderScores: { a: 1, b: 9 },
        },
      ],
      tasksById: new Map([[t.taskId, t]]),
      generators: new Map([['gen-0', fakeGenerator('gen-0', 'response')]]),
      generatorModels: new Map([['gen-0', 'zai/glm-5.3']]),
      panelPool: PANEL_POOL,
      panelFill: PANEL_FILL,
      panelGraders: new Map([
        ['panel-glm', fakeGrader('panel-glm', 0)],
        ['panel-kimi', fakeGrader('panel-kimi', 1)],
        ['panel-pro', fakeGrader('panel-pro', 2)],
        ['panel-fill-0', fakeGrader('panel-fill-0', 0)],
        ['panel-fill-1', fakeGrader('panel-fill-1', 0)],
      ]),
      seed: DEFAULT_SEED,
      holdoutPercent: 20,
    });
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]!.partition).toBe(expectedHoldout ? 'holdout' : 'fit');
    expect(result.resolved[0]!.row.outcome_signals).toContain(
      expectedHoldout ? 'session_holdout' : 'session_fit',
    );
  });

  it('loadDisagreementsFromReport parses embedded disagreements', () => {
    const loaded = loadDisagreementsFromReport(
      JSON.stringify({
        seed: 's',
        holdout_percent: 25,
        pass_score: 7,
        disagreements: [
          {
            taskId: 't1',
            generatorId: 'gen-0',
            graderScores: { 'grader-0': 9, 'grader-1': 1 },
          },
        ],
      }),
    );
    expect(loaded.disagreements).toHaveLength(1);
    expect(loaded.seed).toBe('s');
    expect(loaded.holdoutPercent).toBe(25);
  });

  it('parseAdjudicateArgs accepts required flags', () => {
    const args = parseAdjudicateArgs([
      '--report',
      'r.json',
      '--tasks',
      't.jsonl',
      '--fit',
      'f.jsonl',
      '--holdout',
      'h.jsonl',
      '--generations-out',
      'g.jsonl',
      '--adjudication-report',
      'a.json',
      '--pi-timeout-ms',
      '300000',
    ]);
    expect(args.report).toBe('r.json');
    expect(args.piTimeoutMs).toBe(300_000);
  });
});
