# Dogfood Track B fixtures (SP-203 / #111)

Synthetic **privacy-safe** labeled export for CI and community-bench smoke.

The export JSON lives **outside** the recursive eval harness fixtures tree so
`runHarnessOnDir('tests/eval/fixtures')` does not treat Track B export documents
as native eval fixtures:

- [`../dogfood-track-b/synthetic-labeled-export.json`](../dogfood-track-b/synthetic-labeled-export.json)

Required outcome fields (`success_label`, `min_tier`, `min_model_id`) are
documented on `scripts/eval/dogfood-track-b-adapter.ts`; incomplete exports must
skip Track B rather than invent labels.
