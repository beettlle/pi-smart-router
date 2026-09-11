import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ADVERSARIAL_LABEL_SOURCE,
  AdversarialLabelingError,
  LLM_JUDGE_PROVENANCE_SIGNAL,
  MIN_NEGATIVE_FRACTION,
  assignSessionHoldout,
  assertGeneratorBlinded,
  buildCampaignReport,
  createOpenAiCompatibleGrader,
  createRecordedGenerator,
  createRecordedGrader,
  loadAdversarialTasks,
  normalizeGraderScore,
  parseAdversarialCampaignArgs,
  parseClientSpec,
  parseRecordedEntries,
  runAdversarialCampaignCli,
  runAdversarialLabelingCampaign,
  validateCampaignFloors,
  type AdversarialTask,
  type BlindedGraderInput,
  type CampaignLabeledRow,
  type GeneratorClient,
  type GraderClient,
  type GradingContext,
  type RecordedEntry,
} from '../../scripts/calibration/adversarial-label-campaign.js';
import {
  formatLabelPackJsonl,
  loadLabelPackJsonl,
  serializedPackContainsPromptLeakage,
  type LabelPackRow,
} from '../../scripts/lib/label-pack-schema.js';

const FIXTURE_DIR = join(
  process.cwd(),
  'tests/eval/corpus/label-packs/adversarial-llm-judge',
);
const TASKS_FIXTURE = join(FIXTURE_DIR, 'ci-tasks.jsonl');
const RECORDED_FIXTURE = join(FIXTURE_DIR, 'ci-recorded.jsonl');

function features(seed = 0): Record<string, number> {
  return {
    prompt_length_norm: 0.2 + seed * 0.01,
    estimated_input_tokens_norm: 0.3,
    triage_cyclomatic_score: 0.4,
    requirement_reasoning: 0.5,
    requirement_code_gen: 0.6,
    requirement_tool_use: 0.5,
    has_tool_context: 1,
    compaction_flag: 0,
    routing_latency_norm: 0.1,
    economical_tier: 1,
  };
}

function task(taskId: string, sessionId: string, seed = 0): AdversarialTask {
  return {
    taskId,
    sessionId,
    promptText: `Synthetic prompt for ${taskId}.`,
    tier: 'economical-cloud',
    features: features(seed),
  };
}

function stubGenerator(id: string, prefix = `response-from-${id}`): GeneratorClient {
  return {
    id,
    async generate(t) {
      return `${prefix}:${t.taskId}`;
    },
  };
}

interface CapturedGrade {
  readonly input: BlindedGraderInput;
  readonly context: GradingContext;
}

function stubGrader(
  id: string,
  scores: Record<string, number>,
  captured: CapturedGrade[] = [],
): GraderClient {
  return {
    id,
    async grade(input, context) {
      captured.push({ input, context });
      const key = `${context.taskId}|${context.generatorId}`;
      const score = scores[key] ?? 9;
      return score;
    },
  };
}

function labeledRow(overrides: Partial<CampaignLabeledRow> = {}): CampaignLabeledRow {
  const row: LabelPackRow = {
    schema_version: 1,
    sample_id: 'adversarial-llm-judge:test',
    source: ADVERSARIAL_LABEL_SOURCE,
    features: features(),
    success: true,
    outcome_signals: [LLM_JUDGE_PROVENANCE_SIGNAL],
  };
  return {
    row,
    partition: 'fit',
    taskId: 't',
    generatorId: 'gen-a',
    graderIds: ['grader-a', 'grader-b'],
    judgeScore: 8,
    ...overrides,
  };
}

describe('adversarial-label-campaign (SP-282 / #169)', () => {
  describe('campaign runner', () => {
    it('generates with every generator (multi-model) and grades with all eligible graders', async () => {
      const tasks = [task('t1', 's1'), task('t2', 's2'), task('t3', 's3')];
      const captured: CapturedGrade[] = [];
      const result = await runAdversarialLabelingCampaign(
        tasks,
        [stubGenerator('gen-a'), stubGenerator('gen-b')],
        [stubGrader('grader-a', {}, captured), stubGrader('grader-b', {}, captured)],
        { seed: 'test-seed', holdoutPercent: 0 },
      );
      expect(result.generations).toBe(6);
      expect(result.labeled).toHaveLength(6);
      const generatorSignals = result.labeled.map((entry) =>
        entry.row.outcome_signals?.find((signal) => signal.startsWith('generator:')),
      );
      expect(new Set(generatorSignals)).toEqual(new Set(['generator:gen-a', 'generator:gen-b']));
      // 2 graders × 6 generations
      expect(captured).toHaveLength(12);
    });

    it('excludes the generator from grading its own response', async () => {
      const tasks = [task('t1', 's1')];
      const capturedByDualRole: CapturedGrade[] = [];
      const capturedByIndependent: CapturedGrade[] = [];
      // "gen-a" doubles as a grader id — it must never grade gen-a generations.
      const result = await runAdversarialLabelingCampaign(
        tasks,
        [stubGenerator('gen-a'), stubGenerator('gen-b')],
        [
          stubGrader('gen-a', {}, capturedByDualRole),
          stubGrader('grader-b', {}, capturedByIndependent),
          stubGrader('grader-c', {}),
        ],
        { seed: 'test-seed', holdoutPercent: 0 },
      );
      expect(result.labeled).toHaveLength(2);
      expect(capturedByDualRole.every((grade) => grade.context.generatorId !== 'gen-a')).toBe(
        true,
      );
      expect(capturedByDualRole).toHaveLength(1);
      expect(capturedByDualRole[0]!.context.generatorId).toBe('gen-b');
      // grader-b grades both generations (never generated anything itself)
      expect(capturedByIndependent).toHaveLength(2);
    });

    it('fails loud when generator exclusion leaves fewer than 2 graders', async () => {
      await expect(
        runAdversarialLabelingCampaign(
          [task('t1', 's1')],
          [stubGenerator('gen-a'), stubGenerator('gen-b')],
          [stubGrader('gen-a', {}), stubGrader('gen-b', {})],
        ),
      ).rejects.toThrow(/fewer than 2 graders/);
    });

    it('sends graders a blinded payload: exactly prompt_text + response_text', async () => {
      const captured: CapturedGrade[] = [];
      const blindedTask: AdversarialTask = {
        ...task('taskid-xyz', 's1'),
        promptText: 'Synthetic neutral prompt.',
      };
      const constantGenerator = (id: string): GeneratorClient => ({
        id,
        generate: async () => 'candidate response text',
      });
      await runAdversarialLabelingCampaign(
        [blindedTask],
        [constantGenerator('gen-a'), constantGenerator('gen-b')],
        [stubGrader('grader-a', {}, captured), stubGrader('grader-b', {}, captured)],
        { seed: 'test-seed', holdoutPercent: 0 },
      );
      expect(captured.length).toBeGreaterThan(0);
      for (const grade of captured) {
        expect(Object.keys(grade.input).sort()).toEqual(['prompt_text', 'response_text']);
        expect(JSON.stringify(grade.input)).not.toContain(grade.context.generatorId);
        // task id is harness-side routing metadata, never grader payload
        expect(JSON.stringify(grade.input)).not.toContain('taskid-xyz');
      }
    });

    it('emits llm_judge rows on grader agreement; rows round-trip the pack schema', async () => {
      const result = await runAdversarialLabelingCampaign(
        [task('t1', 's1')],
        [stubGenerator('gen-a'), stubGenerator('gen-b')],
        [stubGrader('grader-a', {}), stubGrader('grader-b', {})],
        { seed: 'test-seed', holdoutPercent: 0 },
      );
      expect(result.labeled).toHaveLength(2);
      for (const entry of result.labeled) {
        expect(entry.row.success).toBe(true);
        expect(entry.row.source).toBe(ADVERSARIAL_LABEL_SOURCE);
        expect(entry.row.outcome_signals).toContain(LLM_JUDGE_PROVENANCE_SIGNAL);
        expect(entry.row.outcome_signals).toContain('dual_judge_agreement');
        expect(entry.row.outcome_signals).toContain('session_fit');
      }
      const jsonl = formatLabelPackJsonl(result.labeled.map((entry) => entry.row));
      expect(serializedPackContainsPromptLeakage(jsonl)).toBe(false);
      const loaded = loadLabelPackJsonl(jsonl, 'adversarial');
      expect(loaded.accepted).toBe(2);
    });

    it('excludes judge disagreements from labels — never coerces a majority vote', async () => {
      const scores = { 't1|gen-a': 2 }; // grader-a fails it, grader-b defaults 9 → disagree
      const result = await runAdversarialLabelingCampaign(
        [task('t1', 's1')],
        [stubGenerator('gen-a'), stubGenerator('gen-b')],
        [stubGrader('grader-a', scores), stubGrader('grader-b', {})],
        { seed: 'test-seed', holdoutPercent: 0 },
      );
      expect(result.labeled).toHaveLength(1);
      expect(result.disagreements).toHaveLength(1);
      expect(result.disagreements[0]).toMatchObject({ taskId: 't1', generatorId: 'gen-a' });
      expect(result.disagreements[0]!.graderScores).toEqual({ 'grader-a': 2, 'grader-b': 9 });
    });

    it('maps agreed failing scores to negative labels with failure_score signals', async () => {
      const scores = { 't1|gen-a': 3, 't1|gen-b': 4 };
      const result = await runAdversarialLabelingCampaign(
        [task('t1', 's1')],
        [stubGenerator('gen-a'), stubGenerator('gen-b')],
        [stubGrader('grader-a', scores), stubGrader('grader-b', scores)],
        { seed: 'test-seed', holdoutPercent: 0 },
      );
      expect(result.labeled).toHaveLength(2);
      for (const entry of result.labeled) {
        expect(entry.row.success).toBe(false);
        expect(entry.row.outcome_signals?.some((s) => s.startsWith('failure_score:'))).toBe(true);
      }
    });

    it('requires multi-model generators and 2–3 graders', async () => {
      const tasks = [task('t1', 's1')];
      await expect(
        runAdversarialLabelingCampaign(tasks, [stubGenerator('gen-a')], [
          stubGrader('g1', {}),
          stubGrader('g2', {}),
        ]),
      ).rejects.toThrow(/≥2 generators/);
      await expect(
        runAdversarialLabelingCampaign(
          tasks,
          [stubGenerator('gen-a'), stubGenerator('gen-b')],
          [stubGrader('g1', {})],
        ),
      ).rejects.toThrow(/2–3 blinded graders/);
      await expect(
        runAdversarialLabelingCampaign(
          tasks,
          [stubGenerator('gen-a'), stubGenerator('gen-b')],
          [
            stubGrader('g1', {}),
            stubGrader('g2', {}),
            stubGrader('g3', {}),
            stubGrader('g4', {}),
          ],
        ),
      ).rejects.toThrow(/2–3 blinded graders/);
      await expect(
        runAdversarialLabelingCampaign(
          tasks,
          [stubGenerator('gen-a'), stubGenerator('gen-a')],
          [stubGrader('g1', {}), stubGrader('g2', {})],
        ),
      ).rejects.toThrow(/Duplicate generator id/);
    });

    it('fails loud on empty generator output and out-of-range grader scores', async () => {
      const tasks = [task('t1', 's1')];
      await expect(
        runAdversarialLabelingCampaign(
          tasks,
          [stubGenerator('gen-a'), { id: 'gen-b', generate: async () => '  ' }],
          [stubGrader('g1', {}), stubGrader('g2', {})],
        ),
      ).rejects.toThrow(/empty response/);
      await expect(
        runAdversarialLabelingCampaign(
          tasks,
          [stubGenerator('gen-a'), stubGenerator('gen-b')],
          [stubGrader('g1', { 't1|gen-a': 12 }), stubGrader('g2', {})],
        ),
      ).rejects.toThrow(/integer 0–9/);
    });

    it('splits holdout by session: deterministic, all rows of a session on one side', async () => {
      const tasks = [
        task('t1', 'sess-a'),
        task('t2', 'sess-a'),
        task('t3', 'sess-b'),
        task('t4', 'sess-c'),
      ];
      const runOnce = async () =>
        runAdversarialLabelingCampaign(
          tasks,
          [stubGenerator('gen-a'), stubGenerator('gen-b')],
          [stubGrader('g1', {}), stubGrader('g2', {})],
          { seed: 'holdout-seed', holdoutPercent: 50 },
        );
      const first = await runOnce();
      const second = await runOnce();
      expect(first.labeled.map((entry) => entry.partition)).toEqual(
        second.labeled.map((entry) => entry.partition),
      );
      const partitionBySession = new Map<string, string>();
      for (const entry of first.labeled) {
        const session = entry.taskId === 't1' || entry.taskId === 't2' ? 'sess-a' : 'other';
        const existing = partitionBySession.get(session);
        if (existing !== undefined) {
          expect(existing).toBe(entry.partition);
        } else {
          partitionBySession.set(session, entry.partition);
        }
      }
      // sess-a tasks t1/t2 must share a partition
      const sessAPartitions = new Set(
        first.labeled
          .filter((entry) => entry.taskId === 't1' || entry.taskId === 't2')
          .map((entry) => entry.partition),
      );
      expect(sessAPartitions.size).toBe(1);
    });
  });

  describe('assignSessionHoldout / blinding / score validation', () => {
    it('is deterministic and validates inputs', () => {
      expect(assignSessionHoldout('sess-x', 'seed', 20)).toBe(
        assignSessionHoldout('sess-x', 'seed', 20),
      );
      expect(assignSessionHoldout('sess-x', 'seed', 0)).toBe(false);
      expect(assignSessionHoldout('sess-x', 'seed', 100)).toBe(true);
      expect(() => assignSessionHoldout('', 'seed', 20)).toThrow(AdversarialLabelingError);
      expect(() => assignSessionHoldout('sess-x', 'seed', 101)).toThrow(AdversarialLabelingError);
    });

    it('assertGeneratorBlinded enforces the exact two-key payload', () => {
      expect(() =>
        assertGeneratorBlinded({ prompt_text: 'p', response_text: 'r' }, 'gen-a'),
      ).not.toThrow();
      expect(() =>
        assertGeneratorBlinded(
          { prompt_text: 'p', response_text: 'r', generator: 'gen-a' } as never,
          'gen-a',
        ),
      ).toThrow(/exactly prompt_text and response_text/);
    });

    it('normalizeGraderScore rejects non-integers and out-of-range values', () => {
      expect(normalizeGraderScore(0, 'ctx')).toBe(0);
      expect(normalizeGraderScore(9, 'ctx')).toBe(9);
      expect(() => normalizeGraderScore(9.5, 'ctx')).toThrow(AdversarialLabelingError);
      expect(() => normalizeGraderScore(-1, 'ctx')).toThrow(AdversarialLabelingError);
      expect(() => normalizeGraderScore('7', 'ctx')).toThrow(AdversarialLabelingError);
    });
  });

  describe('campaign floors', () => {
    it('passes at ≥20% negatives with ≥5 distinct failure scores', () => {
      const rows: CampaignLabeledRow[] = [];
      for (let i = 0; i < 5; i++) {
        rows.push(
          labeledRow({
            row: { ...labeledRow().row, success: false },
            judgeScore: i + 0.5,
          }),
        );
      }
      for (let i = 0; i < 15; i++) {
        rows.push(labeledRow());
      }
      expect(validateCampaignFloors(rows)).toEqual([]);
    });

    it('flags campaigns below the negative floor (Sept-collapse guard)', () => {
      const rows = Array.from({ length: 20 }, () => labeledRow());
      const violations = validateCampaignFloors(rows);
      expect(violations.some((v) => v.includes('negative fraction'))).toBe(true);
      expect(violations.some((v) => v.includes('distinct failure scores'))).toBe(true);
    });

    it('flags too few distinct failure scores', () => {
      const rows: CampaignLabeledRow[] = [];
      for (let i = 0; i < 4; i++) {
        rows.push(labeledRow({ row: { ...labeledRow().row, success: false }, judgeScore: 3 }));
      }
      for (let i = 0; i < 16; i++) {
        rows.push(labeledRow());
      }
      const violations = validateCampaignFloors(rows);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('distinct failure scores 1 below floor 5');
    });

    it('flags empty campaigns', () => {
      expect(validateCampaignFloors([])).toEqual([
        expect.stringContaining('no labeled rows'),
      ]);
    });

    it('buildCampaignReport marks invalid campaigns and tallies partitions', () => {
      const report = buildCampaignReport(
        { labeled: [labeledRow()], disagreements: [], generations: 2, tasksProcessed: 1 },
        {
          seed: 's',
          holdoutPercent: 20,
          passScore: 7,
          minNegativeFraction: MIN_NEGATIVE_FRACTION,
          minDistinctFailureScores: 5,
          warmStartRows: 3,
        },
      );
      expect(report.campaign_valid).toBe(false);
      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.totals.warm_start_rows).toBe(3);
      expect(report.totals.fit_rows).toBe(1);
      expect(report.provenance).toBe('llm_judge');
    });
  });

  describe('recorded replay clients', () => {
    it('replays generations and grades; fails loud on missing entries', async () => {
      const entries: RecordedEntry[] = [
        { kind: 'generation', task_id: 't1', client_id: 'gen-a', response_text: 'r1' },
        { kind: 'grade', task_id: 't1', client_id: 'g1', generator_id: 'gen-a', score: 8 },
      ];
      const generator = createRecordedGenerator('gen-a', entries);
      await expect(generator.generate(task('t1', 's1'))).resolves.toBe('r1');
      await expect(generator.generate(task('t9', 's1'))).rejects.toThrow(/never invent labels/);

      const grader = createRecordedGrader('g1', entries);
      await expect(
        grader.grade(
          { prompt_text: 'p', response_text: 'r1' },
          { taskId: 't1', generatorId: 'gen-a' },
        ),
      ).resolves.toBe(8);
      await expect(
        grader.grade(
          { prompt_text: 'p', response_text: 'rX' },
          { taskId: 't9', generatorId: 'gen-a' },
        ),
      ).rejects.toThrow(/never invent labels/);
    });

    it('parseRecordedEntries validates shape and score range', () => {
      expect(() => parseRecordedEntries('{"kind":"grade","task_id":"t","client_id":"g","generator_id":"x","score":42}')).toThrow(
        /integer 0–9/,
      );
      expect(() => parseRecordedEntries('{"kind":"mystery"}')).toThrow(/generation\|grade/);
      expect(() => parseRecordedEntries('not json')).toThrow(/Invalid JSON/);
    });
  });

  describe('live grader client', () => {
    it('pins temperature 0 and keeps the payload blinded', async () => {
      const bodies: string[] = [];
      const fetchImpl: typeof fetch = (async (_url: unknown, init?: { body?: unknown }) => {
        bodies.push(String(init?.body));
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'SCORE: 7' } }] }),
        } as never;
      }) as never;
      const grader = createOpenAiCompatibleGrader({
        id: 'grader-live',
        model: 'judge-model',
        endpoint: 'https://grader.example/v1',
        apiKey: 'test-key',
        fetchImpl,
      });
      const score = await grader.grade(
        { prompt_text: 'the prompt', response_text: 'the response' },
        { taskId: 't1', generatorId: 'gen-secret-id' },
      );
      expect(score).toBe(7);
      expect(bodies).toHaveLength(1);
      const body = JSON.parse(bodies[0]!) as {
        temperature: number;
        model: string;
        messages: { role: string; content: string }[];
      };
      expect(body.temperature).toBe(0);
      expect(body.model).toBe('judge-model');
      // Blinding: generator identity and task metadata never reach the grader.
      expect(bodies[0]).not.toContain('gen-secret-id');
      expect(bodies[0]).not.toContain('t1');
      expect(bodies[0]).toContain('the prompt');
      expect(bodies[0]).toContain('the response');
    });

    it('fails loud on unparseable grader output and HTTP errors', async () => {
      const unparseable = createOpenAiCompatibleGrader({
        id: 'grader-live',
        model: 'm',
        endpoint: 'https://x.example',
        apiKey: 'k',
        fetchImpl: (async () => ({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'no digits here' } }] }),
        })) as never,
      });
      await expect(
        unparseable.grade(
          { prompt_text: 'p', response_text: 'r' },
          { taskId: 't', generatorId: 'g' },
        ),
      ).rejects.toThrow(/unparseable score/);

      const httpError = createOpenAiCompatibleGrader({
        id: 'grader-live',
        model: 'm',
        endpoint: 'https://x.example',
        apiKey: 'k',
        fetchImpl: (async () => ({ ok: false, status: 429, json: async () => ({}) })) as never,
      });
      await expect(
        httpError.grade({ prompt_text: 'p', response_text: 'r' }, { taskId: 't', generatorId: 'g' }),
      ).rejects.toThrow(/HTTP 429/);
    });
  });

  describe('task loading and arg parsing', () => {
    it('loadAdversarialTasks validates required fields and tainted feature keys', () => {
      const text = readFileSync(TASKS_FIXTURE, 'utf8');
      const tasks = loadAdversarialTasks(text, 'ci-tasks');
      expect(tasks).toHaveLength(12);
      expect(new Set(tasks.map((t) => t.sessionId)).size).toBe(4);

      expect(() => loadAdversarialTasks('{"task_id":"x"}')).toThrow(/session_id/);
      expect(() =>
        loadAdversarialTasks(
          '{"task_id":"x","session_id":"s","prompt_text":"p","features":{"prompt":"raw text"}}',
        ),
      ).toThrow(/tainted keys/);
      expect(() =>
        loadAdversarialTasks(
          '{"task_id":"x","session_id":"s","prompt_text":"p","features":{"a":1}}\n{"task_id":"x","session_id":"s","prompt_text":"p","features":{"a":1}}',
        ),
      ).toThrow(/Duplicate task_id/);
    });

    it('parseAdversarialCampaignArgs parses flags and rejects unknowns', () => {
      const args = parseAdversarialCampaignArgs([
        '--input',
        'a.jsonl',
        '--output',
        'fit.jsonl',
        '--holdout-output',
        'hold.jsonl',
        '--report',
        'rep.json',
        '--recorded',
        'rec.jsonl',
        '--generator',
        'gen-a',
        '--grader',
        'g1',
        '--grader',
        'g2',
        '--seed',
        'xyz',
        '--holdout-percent',
        '25',
        '--pass-score',
        '6',
        '--limit',
        '10',
      ]);
      expect(args.seed).toBe('xyz');
      expect(args.holdoutPercent).toBe(25);
      expect(args.passScore).toBe(6);
      expect(args.limit).toBe(10);
      expect(args.graders).toEqual(['g1', 'g2']);
      expect(() => parseAdversarialCampaignArgs(['--nope'])).toThrow(/Unknown argument/);
    });

    it('parseClientSpec accepts plain ids and id=model@endpoint', () => {
      expect(parseClientSpec('gen-a')).toEqual({ id: 'gen-a' });
      expect(parseClientSpec('gen-a=gpt-5@https://api.example/v1')).toEqual({
        id: 'gen-a',
        model: 'gpt-5',
        endpoint: 'https://api.example/v1',
      });
      expect(() => parseClientSpec('gen-a=@https://api.example')).toThrow(/id=model@endpoint/);
      expect(() => parseClientSpec('BAD ID!')).toThrow(/Invalid client id/);
    });
  });

  describe('CLI end-to-end (recorded fixture)', () => {
    function tmp(): string {
      return mkdtempSync(join(tmpdir(), 'sp282-'));
    }

    it('runs the checked-in fixture campaign: valid, floors met, schema-valid packs', async () => {
      const dir = tmp();
      const fit = join(dir, 'fit.jsonl');
      const holdout = join(dir, 'holdout.jsonl');
      const reportPath = join(dir, 'report.json');
      const code = await runAdversarialCampaignCli([
        '--input',
        TASKS_FIXTURE,
        '--recorded',
        RECORDED_FIXTURE,
        '--generator',
        'gen-alpha',
        '--generator',
        'gen-beta',
        '--grader',
        'grader-one',
        '--grader',
        'grader-two',
        '--output',
        fit,
        '--holdout-output',
        holdout,
        '--report',
        reportPath,
      ]);
      expect(code).toBe(0);

      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        campaign_valid: boolean;
        totals: {
          labeled: number;
          disagreements: number;
          negatives: number;
          negative_fraction: number;
          distinct_failure_scores: number;
          fit_rows: number;
          holdout_rows: number;
        };
      };
      expect(report.campaign_valid).toBe(true);
      expect(report.totals.labeled).toBe(22);
      expect(report.totals.disagreements).toBe(2);
      expect(report.totals.negatives).toBe(5);
      expect(report.totals.negative_fraction).toBeGreaterThanOrEqual(0.2);
      expect(report.totals.distinct_failure_scores).toBe(5);
      expect(report.totals.fit_rows + report.totals.holdout_rows).toBe(22);

      const fitPack = loadLabelPackJsonl(readFileSync(fit, 'utf8'), 'fit');
      const holdoutPack = loadLabelPackJsonl(readFileSync(holdout, 'utf8'), 'holdout');
      expect(fitPack.accepted).toBe(report.totals.fit_rows);
      expect(holdoutPack.accepted).toBe(report.totals.holdout_rows);
      expect(
        fitPack.rows.every((row) => row.outcome_signals?.includes('session_fit')),
      ).toBe(true);
      expect(
        holdoutPack.rows.every((row) => row.outcome_signals?.includes('session_holdout')),
      ).toBe(true);
      expect(
        [...fitPack.rows, ...holdoutPack.rows].every((row) =>
          row.outcome_signals?.includes(LLM_JUDGE_PROVENANCE_SIGNAL),
        ),
      ).toBe(true);

      const serialized = formatLabelPackJsonl([...fitPack.rows, ...holdoutPack.rows]);
      expect(serializedPackContainsPromptLeakage(serialized)).toBe(false);
      expect(serialized).not.toContain('Synthetic candidate response');
      expect(serialized).not.toContain('Synthetic adversarial task');
    });

    it('writes no pack artifacts when floors fail (all-positive campaign)', async () => {
      const dir = tmp();
      const tasksPath = join(dir, 'tasks.jsonl');
      const recordedPath = join(dir, 'recorded.jsonl');
      const taskLines = Array.from({ length: 10 }, (_, i) =>
        JSON.stringify({
          task_id: `t${i}`,
          session_id: `s${i}`,
          prompt_text: `Synthetic task ${i}.`,
          features: features(i),
        }),
      );
      writeFileSync(tasksPath, `${taskLines.join('\n')}\n`, 'utf8');
      const recorded: RecordedEntry[] = [];
      for (let i = 0; i < 10; i++) {
        for (const gen of ['gen-alpha', 'gen-beta']) {
          recorded.push({
            kind: 'generation',
            task_id: `t${i}`,
            client_id: gen,
            response_text: `r${i}-${gen}`,
          });
          recorded.push({ kind: 'grade', task_id: `t${i}`, client_id: 'g1', generator_id: gen, score: 9 });
          recorded.push({ kind: 'grade', task_id: `t${i}`, client_id: 'g2', generator_id: gen, score: 8 });
        }
      }
      writeFileSync(recordedPath, `${recorded.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');

      const fit = join(dir, 'fit.jsonl');
      const holdout = join(dir, 'holdout.jsonl');
      const reportPath = join(dir, 'report.json');
      const code = await runAdversarialCampaignCli([
        '--input',
        tasksPath,
        '--recorded',
        recordedPath,
        '--generator',
        'gen-alpha',
        '--generator',
        'gen-beta',
        '--grader',
        'g1',
        '--grader',
        'g2',
        '--output',
        fit,
        '--holdout-output',
        holdout,
        '--report',
        reportPath,
      ]);
      expect(code).toBe(1);
      expect(existsSync(fit)).toBe(false);
      expect(existsSync(holdout)).toBe(false);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        campaign_valid: boolean;
        violations: string[];
      };
      expect(report.campaign_valid).toBe(false);
      expect(report.violations.some((v) => v.includes('negative fraction'))).toBe(true);
    });

    it('warm-start packs join fit only and must carry exclude_from_holdout_ece', async () => {
      const dir = tmp();
      const weakPack = join(dir, 'weak.jsonl');
      const weakRow: LabelPackRow = {
        schema_version: 1,
        sample_id: 'twinrouterbench-weak:w1',
        source: 'twinrouterbench-weak',
        features: features(),
        success: true,
        outcome_signals: ['weak_tier_proxy', 'exclude_from_holdout_ece'],
      };
      writeFileSync(weakPack, formatLabelPackJsonl([weakRow]), 'utf8');

      const fit = join(dir, 'fit.jsonl');
      const holdout = join(dir, 'holdout.jsonl');
      const reportPath = join(dir, 'report.json');
      const code = await runAdversarialCampaignCli([
        '--input',
        TASKS_FIXTURE,
        '--recorded',
        RECORDED_FIXTURE,
        '--generator',
        'gen-alpha',
        '--generator',
        'gen-beta',
        '--grader',
        'grader-one',
        '--grader',
        'grader-two',
        '--warm-start-pack',
        weakPack,
        '--output',
        fit,
        '--holdout-output',
        holdout,
        '--report',
        reportPath,
      ]);
      expect(code).toBe(0);
      const fitPack = loadLabelPackJsonl(readFileSync(fit, 'utf8'), 'fit');
      const holdoutPack = loadLabelPackJsonl(readFileSync(holdout, 'utf8'), 'holdout');
      expect(fitPack.rows.some((row) => row.sample_id === 'twinrouterbench-weak:w1')).toBe(true);
      expect(holdoutPack.rows.some((row) => row.sample_id === 'twinrouterbench-weak:w1')).toBe(
        false,
      );

      // A pack without the exclusion signal is rejected — weak labels never reach holdout.
      const badPack = join(dir, 'bad.jsonl');
      writeFileSync(
        badPack,
        formatLabelPackJsonl([{ ...weakRow, outcome_signals: ['weak_tier_proxy'] }]),
        'utf8',
      );
      await expect(
        runAdversarialCampaignCli([
          '--input',
          TASKS_FIXTURE,
          '--recorded',
          RECORDED_FIXTURE,
          '--generator',
          'gen-alpha',
          '--generator',
          'gen-beta',
          '--grader',
          'grader-one',
          '--grader',
          'grader-two',
          '--warm-start-pack',
          badPack,
          '--output',
          join(dir, 'f2.jsonl'),
          '--holdout-output',
          join(dir, 'h2.jsonl'),
          '--report',
          join(dir, 'r2.json'),
        ]),
      ).rejects.toThrow(/exclude_from_holdout_ece/);
    });

    it('requires output paths and a client mode', async () => {
      expect(await runAdversarialCampaignCli([])).toBe(1);
      const dir = tmp();
      expect(
        await runAdversarialCampaignCli([
          '--input',
          TASKS_FIXTURE,
          '--output',
          join(dir, 'f.jsonl'),
          '--holdout-output',
          join(dir, 'h.jsonl'),
          '--report',
          join(dir, 'r.json'),
          '--generator',
          'gen-alpha',
          '--generator',
          'gen-beta',
          '--grader',
          'g1',
          '--grader',
          'g2',
        ]),
      ).toBe(1); // no --recorded and no live specs
    });
  });
});
