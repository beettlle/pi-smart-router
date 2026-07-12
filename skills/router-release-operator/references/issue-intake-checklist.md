# Issue intake checklist (pi-smart-router)

Run during **Phase 1** before composing the release manifest.

## GitHub queries

Repo: `beettlle/pi-smart-router`

```bash
gh issue list --repo beettlle/pi-smart-router --state open --limit 100 \
  --json number,title,labels,body

gh issue list --repo beettlle/pi-smart-router --state open --label documentation \
  --json number,title,labels

gh issue list --repo beettlle/pi-smart-router --state open --label bug \
  --json number,title,labels

gh issue list --repo beettlle/pi-smart-router --state open --label enhancement \
  --json number,title,labels
```

## Label taxonomy

| Label | Release bucket | Priority notes |
|-------|----------------|----------------|
| `documentation` | Documentation | Highest — address before enhancements when theme allows |
| `bug` | Bug fix | Prefer user-impact, reproducible, already-tasked |
| `enhancement` | Enhancement | Minor/major only; zero per patch |
| Priority in title/body (P0–P3) | Any | Prefer P0/P1 dogfood over P3 eval when choosing among enhancements |

## Roadmap and theme fit

Read [`docs/routing-roadmap.md`](../../../docs/routing-roadmap.md) before selecting enhancements.

| Kind | Examples | Theme wording |
|------|----------|---------------|
| User-facing routing | Pinning, triage, local_zero, dogfood fixes | Name the user-visible behavior |
| Eval / infra | Corpora, benches, release gates soft-feed | Name the eval/tooling track; do not mix with unrelated dogfood unless one theme |

When multiple enhancements compete, prefer P0/P1 dogfood / routing quality over P3 bench/community work unless the operator sets an eval theme.

## Issue → task mapping

1. Grep pending and done tasks for issue links:

   ```bash
   rg 'GitHub: beettlle/pi-smart-router#|Closes:|Partial:' spine-tasks/*/PROMPT.md
   ```

2. Classify each open issue:

   | State | Action |
   |-------|--------|
   | Mapped to pending SP-* | Candidate for manifest if fits profile + theme |
   | Mapped to `.DONE` SP-* | Closed by shipped work — exclude |
   | No SP-* yet | **Gap** — author with `create-spine-tasks` in Phase 3 |
   | Epic / `[Epic]` in title | Defer unless major profile with operator approval |
   | Hardware (#1/#25/#26) | Defer — physical access |

## Documentation issue heuristics

Prefer for release inclusion when:

- `label:documentation` or title/body is README, quickstart, operator guide, env vars
- Pending SP-* with docs-only File Scope
- Docs required to ship the release theme (minor)

## Bug issue heuristics

Prefer when:

- Repro steps in issue body or linked diagnosis
- Already has pending SP-* linked to the GitHub issue
- S/M size, disjoint file scope from parallel neighbors
- User-visible failure (routing, failover, pin, install)

Exclude when:

- Fixed on `main` but issue not closed
- Blocked by epic infrastructure not in this release

If **no open bugs**, record that for audit — do not invent OVERRIDE.

## Enhancement issue heuristics

**Patch profile:** exclude all. If operator wants them, **reclassify release as minor**.

**Minor profile:** pick 1–3 **related** issues that complete the theme:

- User-visible or operator-visible improvement
- S/M size; split L/XL first
- Disjoint `fileScopeMustChange` from bug tasks in same wave
- Prefer roadmap P0/P1 over P3 when both fit

## Pending task inventory

```bash
spine plan pending
spine tasks validate pending
spine tasks analyze pending
```

Read `spine-tasks/CONTEXT.md` for `Next Task ID` and phase notes.

Cross-reference pending SP-* with open issues. The release executes **manifest scope only**, not all pending tasks.

## Intake output table

| Issue # | Labels | Mapped SP-* | Bucket | Theme fit | Profile fit | Notes |
|---------|--------|-------------|--------|-----------|-------------|-------|
| #97 | bug | SP-176 | bug | dogfood ✓ | minor ✓ | triage fix |
| #101 | enhancement | — | enh | eval corpus | patch ✗ → use minor | TwinRouterBench |
