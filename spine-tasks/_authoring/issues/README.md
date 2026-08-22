# Issue drafts — paste / apply instructions

Paste-ready bodies for the post-assessment four outcomes. Created because GitHub API may be unavailable from CI/agent environments.

## 0.17 audit backlog (`audit-v017/`)

Created 2026-08-22 via `scripts/github/create-audit-v017-issues.sh`. Manifest: `scripts/github/audit-v017-issues-created.txt`.

| File | Priority | GitHub |
|------|----------|--------|
| [A1-ci-quality-gates.md](./audit-v017/A1-ci-quality-gates.md) | P0 | [#135](https://github.com/beettlle/pi-smart-router/issues/135) |
| [A2-sync-contracts.md](./audit-v017/A2-sync-contracts.md) | P0 | [#136](https://github.com/beettlle/pi-smart-router/issues/136) |
| [A3-sp222-producer.md](./audit-v017/A3-sp222-producer.md) | P0 | [#137](https://github.com/beettlle/pi-smart-router/issues/137) |
| [A4-expected-cost-log-gate.md](./audit-v017/A4-expected-cost-log-gate.md) | P0 | [#138](https://github.com/beettlle/pi-smart-router/issues/138) |
| [A5-flaky-sc004-test.md](./audit-v017/A5-flaky-sc004-test.md) | P0 | [#139](https://github.com/beettlle/pi-smart-router/issues/139) |
| [A6-route-delegate-fail-open.md](./audit-v017/A6-route-delegate-fail-open.md) | P0 | [#140](https://github.com/beettlle/pi-smart-router/issues/140) |
| [A7-concurrent-route-safety.md](./audit-v017/A7-concurrent-route-safety.md) | P0 | [#141](https://github.com/beettlle/pi-smart-router/issues/141) |
| [A8-sqlite-blocking.md](./audit-v017/A8-sqlite-blocking.md) | P0 | [#142](https://github.com/beettlle/pi-smart-router/issues/142) |
| [B1-split-router-pipeline.md](./audit-v017/B1-split-router-pipeline.md) | P1 | [#143](https://github.com/beettlle/pi-smart-router/issues/143) |
| [B2-extension-coverage.md](./audit-v017/B2-extension-coverage.md) | P1 | [#144](https://github.com/beettlle/pi-smart-router/issues/144) |
| [B3-session-teardown.md](./audit-v017/B3-session-teardown.md) | P1 | [#145](https://github.com/beettlle/pi-smart-router/issues/145) |
| [B4-telemetry-hmac.md](./audit-v017/B4-telemetry-hmac.md) | P1 | [#146](https://github.com/beettlle/pi-smart-router/issues/146) |
| [B5-onnx-pinning.md](./audit-v017/B5-onnx-pinning.md) | P1 | [#147](https://github.com/beettlle/pi-smart-router/issues/147) |
| [B6-degraded-hydra-mode.md](./audit-v017/B6-degraded-hydra-mode.md) | P1 | [#148](https://github.com/beettlle/pi-smart-router/issues/148) |
| [B7-extension-facade.md](./audit-v017/B7-extension-facade.md) | P1 | [#149](https://github.com/beettlle/pi-smart-router/issues/149) |
| [C1-scripts-artifacts.md](./audit-v017/C1-scripts-artifacts.md) | P2 | [#150](https://github.com/beettlle/pi-smart-router/issues/150) |
| [C2-hardware-probe-tests.md](./audit-v017/C2-hardware-probe-tests.md) | P2 | [#151](https://github.com/beettlle/pi-smart-router/issues/151) |
| [C3-docs-reconcile.md](./audit-v017/C3-docs-reconcile.md) | P2 | [#152](https://github.com/beettlle/pi-smart-router/issues/152) |
| [C4-extension-parity-docs.md](./audit-v017/C4-extension-parity-docs.md) | P2 | [#153](https://github.com/beettlle/pi-smart-router/issues/153) |
| [C5-node-engine.md](./audit-v017/C5-node-engine.md) | P2 | [#154](https://github.com/beettlle/pi-smart-router/issues/154) |
| [C6-fragment-pipeline-tests.md](./audit-v017/C6-fragment-pipeline-tests.md) | P2 | [#155](https://github.com/beettlle/pi-smart-router/issues/155) |
| [D1-spine-hygiene.md](./audit-v017/D1-spine-hygiene.md) | P3 | [#156](https://github.com/beettlle/pi-smart-router/issues/156) |
| [D2-eslint-flat-config.md](./audit-v017/D2-eslint-flat-config.md) | P3 | [#157](https://github.com/beettlle/pi-smart-router/issues/157) |

## Files (prior batches)

| File | GitHub action |
|------|----------------|
| [issue-95-update.md](./issue-95-update.md) | Comment or replace body on **#95** |
| [issue-75-update.md](./issue-75-update.md) | Comment on closed **#75** pointing to profile-coverage follow-on (do not reopen) |
| [issue-NEW-profile-coverage.md](./issue-NEW-profile-coverage.md) | **Created** as [#108](https://github.com/beettlle/pi-smart-router/issues/108) |
| [issue-96-update.md](./issue-96-update.md) | Comment or replace body on **#96** |
| [issue-NEW-behavioral-calibration.md](./issue-NEW-behavioral-calibration.md) | **Create** new issue |
| [issue-NEW-track-b-adapter.md](./issue-NEW-track-b-adapter.md) | **Create** new issue |
| [issue-NEW-overrouting-analysis.md](./issue-NEW-overrouting-analysis.md) | **Create** new issue |
| [issue-NEW-encoder-holdout-decision.md](./issue-NEW-encoder-holdout-decision.md) | **Create** new issue |
| [issue-NEW-roadmap-sync.md](./issue-NEW-roadmap-sync.md) | **Create** new issue |
| [issue-NEW-quota-window-feed.md](./issue-NEW-quota-window-feed.md) | **Created** as [#125](https://github.com/beettlle/pi-smart-router/issues/125) |

## Human QA (not an issue body)

- Protocol: [`docs/qa/shadow-dogfood-protocol.md`](../../../docs/qa/shadow-dogfood-protocol.md)
- Script: `npm run qa:shadow-dogfood`

## Apply with gh (when authenticated)

From repo root:

```bash
# Updates — append body as comment (safer than overwriting history)
gh issue comment 95 --body-file spine-tasks/_authoring/issues/issue-95-update.md
gh issue comment 75 --body "\`#75\` implementation (ingest / mapper / aliases) remains complete. Remaining dogfood fleet coverage (\`benchmark\` vs \`pattern_default\`) is tracked in the follow-on — see \`spine-tasks/_authoring/issues/issue-NEW-profile-coverage.md\` (create that issue if not yet opened)."
gh issue comment 96 --body-file spine-tasks/_authoring/issues/issue-96-update.md

# Creates — adjust title/labels to match draft headers
gh issue create --title "Capability profile coverage: dogfood fleet benchmark vs pattern_default" \
  --body-file spine-tasks/_authoring/issues/issue-NEW-profile-coverage.md

gh issue create --title "Ship real P(success) + isotonic calibration from behavioral dogfood signals" \
  --body-file spine-tasks/_authoring/issues/issue-NEW-behavioral-calibration.md

gh issue create --title "Community Track B: dogfood export → eval harness adapter (no invented labels)" \
  --body-file spine-tasks/_authoring/issues/issue-NEW-track-b-adapter.md

gh issue create --title "Analyze TwinRouterBench CI corpus over-routing (~0.85 vs 0.15 gate)" \
  --body-file spine-tasks/_authoring/issues/issue-NEW-overrouting-analysis.md

gh issue create --title "Run pack holdout ECE + encoder latency; produce #96 go/no-go artifact" \
  --body-file spine-tasks/_authoring/issues/issue-NEW-encoder-holdout-decision.md

gh issue create --title "Docs: refresh docs/routing-roadmap.md status column (landed vs Gap)" \
  --body-file spine-tasks/_authoring/issues/issue-NEW-roadmap-sync.md

gh issue create --title "routing: live / estimated quota window feed for virtual cost v2" \
  --label enhancement \
  --body-file spine-tasks/_authoring/issues/issue-NEW-quota-window-feed.md
```

If `gh` returns Forbidden, paste the markdown bodies manually in the GitHub UI.
