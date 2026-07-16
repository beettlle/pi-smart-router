#!/usr/bin/env node
/**
 * Insert one honest feedback outcome for a request_id into state.db.
 * Usage: npx tsx scripts/qa/record-feedback.ts <request_id> <good|bad> [model_id]
 */

import Database from 'better-sqlite3';
import { resolve } from 'node:path';

import { getRouterStateDbPath } from '../../.pi/extensions/smart-router/utils.js';

function main(argv: readonly string[]): void {
  const requestId = argv[2];
  const rating = argv[3];
  const modelId = argv[4];

  if (!requestId || (rating !== 'good' && rating !== 'bad')) {
    console.error('Usage: npx tsx scripts/qa/record-feedback.ts <request_id> <good|bad> [model_id]');
    process.exit(1);
  }

  const dbPath = getRouterStateDbPath(resolve(process.cwd()));
  const db = new Database(dbPath);
  try {
    const existing = db
      .prepare(
        `SELECT COUNT(*) AS n FROM outcomes
         WHERE request_id = ? AND signal_type IN ('feedback_good','feedback_bad')`,
      )
      .get(requestId) as { n: number };

    if (existing.n > 0) {
      console.log(JSON.stringify({ skipped: true, reason: 'already_labeled', request_id: requestId }));
      return;
    }

    const tel = db
      .prepare(`SELECT session_id, selected_model_id FROM telemetry WHERE request_id = ? ORDER BY id DESC LIMIT 1`)
      .get(requestId) as { session_id: string; selected_model_id: string } | undefined;

    const sessionId = tel?.session_id ?? 'dogfood-gather';
    const routed = modelId || tel?.selected_model_id || null;
    const signal = rating === 'good' ? 'feedback_good' : 'feedback_bad';
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO outcomes (
        request_id, session_id, timestamp, signal_type, routed_model_id, override_model_id
      ) VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(requestId, sessionId, timestamp, signal, routed);

    console.log(JSON.stringify({
      labeled: true,
      request_id: requestId,
      signal_type: signal,
      session_id: sessionId,
      routed_model_id: routed,
    }));
  } finally {
    db.close();
  }
}

main(process.argv);
