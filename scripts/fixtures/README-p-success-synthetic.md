# P(success) synthetic train fixture

**File:** `p-success-synthetic-train.jsonl`
**Provenance:** synthetic/fixture (SP-175) — not community contrib.
**Contents:** 40 privacy-safe labeled rows (feature scalars + `success_label` / `outcome_signals`).
**Never includes:** prompt text, messages, tool arguments, or raw session identifiers.

Train dogfood weights:

```bash
npm run routing:train-p-success -- --input scripts/fixtures/p-success-synthetic-train.jsonl
```
