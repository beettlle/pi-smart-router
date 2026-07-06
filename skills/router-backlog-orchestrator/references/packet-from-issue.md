# Spine packet from GitHub issue

Map GitHub issue fields → `spine-tasks/SP-0xx-slug/PROMPT.md`.

## PROMPT skeleton

```markdown
# Task: SP-0xx — Short Slug

**Created:** YYYY-MM-DD
**Size:** S|M

## Review Level: 1

**Assessment:** One-line scope from issue title.
**Score:** N/8

## Source

- GitHub: beettlle/pi-smart-router#NNN
- Bucket: documentation|bug|feature

## Mission

(Paste or distill issue body — acceptance criteria as prose.)

## Dependencies

- SP-0yy   # prior task if hot-file or logical order

## Context to Read First

- (paths from issue + codebase search)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `path/to/file.ts` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `path/to/primary/file.ts` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | (from issue acceptance criteria) |

## Steps

### Step 1: ...

- [ ] ...

### Step 2: Testing and verification

- [ ] Run `npm run verify:ci`
- [ ] (issue-specific checks)

## Completion Criteria

- [ ] (bullet list mirroring issue)
```

## Field mapping

| GitHub | PROMPT section |
|--------|----------------|
| `title` | `# Task: SP-0xx —` suffix; Review Level assessment |
| `body` | Mission, Steps, Completion Criteria |
| `labels` | Source bucket; hints for File Scope |
| `number` | `## Source` link |

## STATUS.md

Use template from `.cursor/rules/taskplane/status-template.md`. Initialize all checkboxes unchecked.

## dependencies.json

Add edge `"SP-0xx": ["SP-0yy"]` matching PROMPT `## Dependencies`.

## CONTEXT.md

After creating packets:
- Bump `Next Task ID`
- Add phase table row(s) for new tasks
- Update `Last Updated` date

## Validation

```bash
spine tasks validate pending
spine tasks analyze pending
spine plan pending
```

Fix contract paths: no trailing `/`, no parenthetical path comments.
