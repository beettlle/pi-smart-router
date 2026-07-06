---
name: router-backlog-orchestrator
description: Plans and executes the next pi-smart-router development cycle from GitHub issues and spine backlog. Prioritizes documentation first, then bugs, then features at one feature per 3-5 bugs. Creates SP-* task packets, runs spine batch with monitoring, and files issues on beettlle/pi-spine or beettlle/pi-smart-router as appropriate.
disable-model-invocation: true
compatibility: Requires gh CLI, spine CLI, git, Node >= 20. Run from repo root on main.
---

# Router Backlog Orchestrator

Orchestrates **backlog triage → spine packet authoring → batch execution → issue filing** for [pi-smart-router](https://github.com/beettlle/pi-smart-router).

Invoke explicitly: `/skill:router-backlog-orchestrator`

**Compose with:**
- pi-spine `create-spine-tasks` skill — packet structure and size rules
- [`skills/spine-autonomous-operator/SKILL.md`](../spine-autonomous-operator/SKILL.md) — preflight, wave loop, recovery, pi-spine issue filing
- [`.cursor/rules/spine-task-authoring.mdc`](../../.cursor/rules/spine-task-authoring.mdc) — PROMPT/STATUS contracts
- [`.cursor/rules/spine-operator-cursor.mdc`](../../.cursor/rules/spine-operator-cursor.mdc) — spine CLI reference

## Success criteria

1. Backlog plan approved by operator before batch start
2. Documentation issues processed before bugs; feature ratio **1 per 3–5 bugs**
3. New `SP-*` packets validate (`spine tasks validate pending`)
4. Queued scope lands on `main` via gate + integrate
5. Linked GitHub issues commented/closed when tasks complete
6. Engine faults filed at [pi-spine issues](https://github.com/beettlle/pi-spine/issues); product defects at [pi-smart-router issues](https://github.com/beettlle/pi-smart-router/issues)

## Hard rules

- **Never** hand-edit `.spine/batch-state.json` or `.spine/runtime/**`
- **Never** start a batch without operator approval of the backlog plan table
- **Never** claim batch/test success without CLI output
- **Never** create XL tasks; split epics into S/M packets
- **Always** run docs bucket completely before bug/feature ratio units
- **Always** link packets to GitHub issues in `## Source`

## Phase 0 — Baseline

```bash
cd <repo-root>
gh auth status
spine --version && spine doctor
git status && git branch --show-current   # must be main
```

Stop if not on `main` or `gh`/`spine` unavailable.

Optional snapshot:

```bash
skills/router-backlog-orchestrator/scripts/collect-backlog.sh
```

## Phase 1 — Collect backlog

**GitHub:**

```bash
gh issue list --repo beettlle/pi-smart-router --state open --limit 100 \
  --json number,title,labels,body,url,createdAt
```

**Local spine:**

```bash
spine plan pending
spine plan all
```

Scan for orphan packets (PROMPT without `.DONE`). Read [`spine-tasks/CONTEXT.md`](../../spine-tasks/CONTEXT.md) for `Next Task ID`.

Write optional authoring snapshot: `spine-tasks/_authoring/backlog-snapshot-YYYYMMDD.md`.

## Phase 2 — Classify and dedupe

Use [references/prioritization-rubric.md](references/prioritization-rubric.md).

| Bucket | Signals |
|--------|---------|
| documentation | label `documentation`, or README/docs/quickstart/operator guide |
| bug | label `bug`, fix/wiring/regression/P0 audit |
| feature | label `enhancement`, new capability |
| epic | title `[Epic]` or multiple deliverables → **split** before authoring |

Dedup:
- Search `spine-tasks/**/PROMPT.md` for `GitHub: beettlle/pi-smart-router#NNN`
- Skip issues already linked to `.DONE` tasks unless amendment needed
- Prefer GitHub issue over duplicate orphan PROMPT

## Phase 3 — Prioritize

**Order:**
1. All **documentation** issues
2. **Bugs** — user-facing / CI blockers first, then wiring/refactors; decompose epics
3. **Features** — one per ratio unit after every **3–5 bugs**

**Default batch scope per invocation:**
- All open doc tasks first
- Then **one ratio unit**: 3–5 bugs + 1 feature
- Repeat until operator stops or backlog empty

## Phase 4 — Operator approval

Present a **Backlog Plan** table before any writes:

| Order | Issue | Bucket | Proposed SP-ID | Size | Notes |
|-------|-------|--------|----------------|------|-------|

Include ratio summary (e.g. "4 bugs + 1 feature this cycle"). **Stop** until operator approves.

## Phase 5 — Author spine packets

Follow [references/packet-from-issue.md](references/packet-from-issue.md) and `create-spine-tasks`:

1. Allocate IDs from `Next Task ID` in `spine-tasks/CONTEXT.md`
2. Create `spine-tasks/SP-0xx-slug/PROMPT.md` + `STATUS.md`
3. Add `## Source` with GitHub link and bucket
4. Update `spine-tasks/dependencies.json` (serialize hot files: `.pi/extensions/smart-router/index.ts`, `src/domain/pipeline/router-pipeline.ts`)
5. Validate:

```bash
spine tasks validate pending
spine tasks analyze pending
spine plan pending
```

6. Commit on `main`:

```bash
git add spine-tasks/
git commit -m "chore(spine): queue SP-0xx+ from backlog orchestrator"
```

## Phase 6 — Execute spine batch

Hand off to [`skills/spine-autonomous-operator/SKILL.md`](../spine-autonomous-operator/SKILL.md) **Phase 2 onward**:

- `spine preflight` (green required)
- Wave loop: `spine batch start pending --wave N --attached`
- Monitor: `spine status --diagnose`, `spine wait`
- Land: `spine gate approve` → `spine integrate` → `npm install` → `npm run verify:ci` → `spine batch complete`

Do not advance waves until current wave is integrated on `main`.

## Phase 7 — Issue filing

| Situation | Repo | Action |
|-----------|------|--------|
| Repeatable spine fault after `suggestedCommand` | beettlle/pi-spine | `spine issue draft --create` or template in spine-autonomous-operator |
| Product bug / regression found during work | beettlle/pi-smart-router | [references/github-router-issue-template.md](references/github-router-issue-template.md) |
| Task lands (.DONE + integrate) | beettlle/pi-smart-router | Comment summary + **close** linked issue if acceptance met |

Search existing issues before creating duplicates.

## Phase 8 — Final report

1. Backlog plan executed (issue → SP mapping)
2. Ratio achieved (bugs vs features)
3. GitHub issues opened/closed/commented (URLs)
4. Spine recovery actions
5. Verification: `spine plan pending`, `spine preflight`, `npm run verify:ci` — **block success on any failure**
6. Remaining backlog preview for next invocation

**Final report verification template** — list each CI step pass/fail:

| Step | Command | Result |
|------|---------|--------|
| Build | `npm run build` | pass / fail |
| Typecheck | `npm run typecheck` | pass / fail |
| Lint | `npm run lint` | pass / fail |
| Test | `npm test` | pass / fail |
| Coverage | `npm run coverage:check` | pass / fail |

Do not claim orchestrator success unless `npm run verify:ci` exits 0 and the table is included in the report.

## Short prompt (resume)

```text
Run router-backlog-orchestrator: collect GitHub + spine backlog → classify →
prioritize (docs first, 3-5 bugs + 1 feature) → show plan → author SP packets →
spine preflight → batch waves → file issues → final report.
```
