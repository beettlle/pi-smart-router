# Behavioral calibration Partial — SP-206 / #110

**Date:** 2026-07-12  
**Release:** v0.12.0  
**Task:** SP-206  
**Issue:** [#110](https://github.com/beettlle/pi-smart-router/issues/110)  
**Path:** **(B) Partial** — floors unmet; artifacts **not** shipped as behavioral

---

## Verdict

Do **not** close #110. Do **not** overwrite checked-in `config/p-success-weights.json` or invent `config/routing-calibration.json` as behavioral. Synthetic/fixture weights (SP-175) remain the interim checked-in dogfood enablement only.

---

## Sample counts (operator #95 window)

| Metric | Count | Floor | Met? |
|--------|------:|------:|:----:|
| Privacy-safe dogfood export paths | 0 | ≥1 archived export | No |
| Aggregated train JSONL rows | 0 | — | No |
| Labeled economical-tier rows | **0** | ≥30 (`p_success_weights` / `isotonic_calibrator`) | **No** |
| Hydra / triage / centroid floors | n/a | see `config/routing-calibration.json.example` | Skipped |

**Export paths:** none (operator confirmed 2026-07-12).  
**Aggregate:** skipped — no source exports under `.pi-smart-router/`, `data/contrib/` (only `example.json` fixture), or operator-archived #95 paths.  
**Privacy spot-check:** N/A — no training input to inspect; no labels invented.

---

## Blocker

External dependency on [#95](https://github.com/beettlle/pi-smart-router/issues/95) live shadow dogfood exports was not satisfied for this release window:

- No dataset export (`/smart-router export dataset`)
- No telemetry-contrib export (`/smart-router export telemetry-contrib`)
- Human #95 checklist in `spine-tasks/_authoring/release-v0.12.0/manifest.md` remains open

**Never invent labels** or rebrand synthetic fixture rows as behavioral.

---

## Config status after SP-206

| Artifact | Status |
|----------|--------|
| `config/p-success-weights.json` | **Unchanged** — provenance `synthetic_fixture` / SP-175 |
| `config/routing-calibration.json` | **Not created** — operator-local / future train when floors met |
| Soft ECE / `routing:calibration-dry-run` | Still enforced via existing CI / verify paths |
| README calibration section | Updated to **deferred / Partial** |

---

## Resume when floors are met

1. Complete #95 dogfood + archive privacy-safe exports (features + labels only).
2. `npm run routing:calibration-aggregate -- --contrib-dir <dir>`
3. Confirm ≥30 labeled economical-tier rows in STATUS Discoveries.
4. `npm run routing:train-p-success` / `npm run routing:train-calibration` with **non-synthetic** provenance.
5. Ship `config/p-success-weights.json` and/or `config/routing-calibration.json`; run verify + soft dry-run.
6. Close #110 only after verify green and provenance honest.

---

## Related

- Manifest: `spine-tasks/_authoring/release-v0.12.0/manifest.md` (Wave 2 path B)
- Docs: README § P(success) / behavioral-first bootstrap (SP-205)
- Protocol: `docs/qa/shadow-dogfood-protocol.md`
