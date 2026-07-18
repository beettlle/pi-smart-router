# Issue drafts — paste / apply instructions

Paste-ready bodies for the post-assessment four outcomes. Created because GitHub API may be unavailable from CI/agent environments.

## Files

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
