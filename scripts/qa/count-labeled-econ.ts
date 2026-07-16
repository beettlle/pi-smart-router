#!/usr/bin/env node
/**
 * Count labeled economical-tier rows in a dogfood dataset JSONL export.
 * Used by the #95 / #110 gather window (docs/qa/shadow-dogfood-protocol.md).
 *
 * Usage:
 *   npx tsx scripts/qa/count-labeled-econ.ts path/to/dataset.jsonl
 *   npm run qa:count-labeled-econ -- path/to/dataset.jsonl
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ECON_TIERS = new Set(['economical-cloud', 'zero-tier']);
const FLOOR = 30;

export interface LabeledEconCount {
  readonly path: string;
  readonly total: number;
  readonly labeled_econ: number;
  readonly good: number;
  readonly bad: number;
  readonly unlabeled_econ: number;
  readonly frontier_labeled: number;
  readonly need: number;
  readonly floor: number;
  readonly floor_met: boolean;
  readonly signals: Readonly<Record<string, number>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function countLabeledEcon(jsonlPath: string): LabeledEconCount {
  const text = readFileSync(jsonlPath, 'utf8');
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  let labeledEcon = 0;
  let good = 0;
  let bad = 0;
  let unlabeledEcon = 0;
  let frontierLabeled = 0;
  const signals: Record<string, number> = {};

  for (const line of lines) {
    const row = JSON.parse(line) as unknown;
    if (!isRecord(row)) {
      throw new Error(`Invalid JSONL row (not an object): ${line.slice(0, 80)}`);
    }

    const tier = typeof row.tier === 'string' ? row.tier : '';
    const isEcon = ECON_TIERS.has(tier);
    const label = row.success_label;
    const hasLabel = typeof label === 'boolean';

    if (Array.isArray(row.outcome_signals)) {
      for (const signal of row.outcome_signals) {
        if (typeof signal === 'string') {
          signals[signal] = (signals[signal] ?? 0) + 1;
        }
      }
    }

    if (isEcon && hasLabel) {
      labeledEcon += 1;
      if (label === true) good += 1;
      else bad += 1;
    } else if (isEcon && !hasLabel) {
      unlabeledEcon += 1;
    } else if (!isEcon && hasLabel) {
      frontierLabeled += 1;
    }
  }

  return {
    path: resolve(jsonlPath),
    total: lines.length,
    labeled_econ: labeledEcon,
    good,
    bad,
    unlabeled_econ: unlabeledEcon,
    frontier_labeled: frontierLabeled,
    need: Math.max(0, FLOOR - labeledEcon),
    floor: FLOOR,
    floor_met: labeledEcon >= FLOOR,
    signals,
  };
}

function main(argv: readonly string[]): void {
  const pathArg = argv[2];
  if (!pathArg || pathArg === '-h' || pathArg === '--help') {
    console.error('Usage: npx tsx scripts/qa/count-labeled-econ.ts <dataset.jsonl>');
    process.exit(pathArg ? 0 : 1);
  }

  const result = countLabeledEcon(pathArg);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.floor_met ? 0 : 2);
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('count-labeled-econ.ts') || entry.endsWith('count-labeled-econ.js')) {
  main(process.argv);
}
