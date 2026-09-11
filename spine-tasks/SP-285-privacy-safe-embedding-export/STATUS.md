**Current Step:** Step 2: Testing & Verification
**Status:** In progress
**Last Updated:** 2026-09-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Read CONTEXT + linked issue + migration honesty section
- [x] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts

## Step 1: Implementation

**Status:** Complete

- [x] Deliver mission outcomes within File Scope

**Evidence (2026-09-11):**
- Opt-in embedding capture: `SMART_ROUTER_DATASET_EMBEDDINGS=1` gates single-pass
  `extractRequirementsDetailed` in `hydra-matcher.ts` (fail-loud shape check, 384-dim);
  capture flows pipeline sidecar → `dataset-recorder` → SQLite `embedding_json`
  (migration v8, fail-loud corrupt-cell parse).
- Export: `export telemetry-contrib --embeddings` (CLI parse + extension command +
  `bin/pi-smart-router.mjs` plumbed); embeddings omitted unless both capture env var
  and flag are set. No raw prompt text anywhere on the path.
- Completeness: contrib rows now carry `row_id` (HMAC-SHA256 of request_id with `row:`
  domain separation), `prompt_length_chars`, `message_count`; schema v2 additive
  (format version unchanged). Tainted-key allowlist added export- and ingest-side so
  count-only fields pass while prompt-content keys still fail closed.
- Aggregate: dedup by `row_id` (idempotent re-exports), embedding-row count vs
  hydra_projection ≥100 floor reported with honest-untrained warning;
  `labeledSampleFromContribRecord` prefers `row_id` over index fallbacks
  (reproducible isotonic splits).
- Wire contract: decision sidecar `embedding` absent unless capture enabled
  (byte-identical default wire); JSON Schema + Zod updated optional.
- Docs: README export/env sections + `data/contrib/example.json` refreshed to v2.
- Prior session left Step 1 uncommitted mid-flight (tainted-pattern rejected new
  count fields; `--embeddings` parsed but not plumbed); completed and fixed here.

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Run contract testCommand
- [ ] Update STATUS with evidence
