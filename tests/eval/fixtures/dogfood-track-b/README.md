# Dogfood Track B fixtures (SP-203 / #111)

Synthetic **privacy-safe** labeled export for CI and community-bench smoke.

- `synthetic-labeled-export.json` — fully labeled rows (`success_label`, `min_tier`,
  `min_model_id`) mapped by `scripts/eval/dogfood-track-b-adapter.ts` into harness
  fixtures. No live prompts or invented outcome labels.

Required outcome fields are documented on the adapter module; incomplete exports
must skip Track B rather than invent labels.
