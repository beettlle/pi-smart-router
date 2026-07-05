# pi-smart-router GitHub issue template

File product bugs and gaps at https://github.com/beettlle/pi-smart-router/issues

Search existing issues before creating.

## Title format

```text
[bug] Short description
[docs] Short description
[enhancement] Short description
```

## Body template

```markdown
## Summary

One paragraph describing the problem or gap.

## Environment

- pi-smart-router: `<git rev-parse --short HEAD>`
- pi: `pi --version`
- Node: `node --version`
- Provider/model (if routing): e.g. smart-router/auto → gemini-flash

## Steps to reproduce

1. ...
2. ...

## Expected

...

## Actual

...

## Spine task (if any)

- SP-0xx-slug (link or path)
- Batch ID: `.spine/runtime/...` (if applicable)

## Verification

Commands that demonstrate fix or repro:

```bash
npm run typecheck && npm test
```

## Labels

- `bug` | `documentation` | `enhancement`
```

## Create via gh

```bash
gh issue create --repo beettlle/pi-smart-router \
  --title "[bug] ..." \
  --label bug \
  --body-file /tmp/issue-body.md
```

## Close linked issue after SP task lands

```bash
gh issue comment 13 --repo beettlle/pi-smart-router \
  --body "Fixed in SP-047, integrated on main. Verification: npm run typecheck && npm test."

gh issue close 13 --repo beettlle/pi-smart-router --reason completed
```

Only close when acceptance criteria from the issue are met and verification output is attached or referenced.
