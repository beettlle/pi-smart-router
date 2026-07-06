# SP-079 Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-05

## Discoveries

- `/smart-router unpin` was already functional via SP-076 in `.pi/extensions/smart-router/commands.ts`.
- PROMPT file-scope paths (`src/cli/smart-router-cli.ts`) did not exist; added library CLI module per contract.

## Step 1: Add command

**Status:** ✅ Complete

- [x] Register `unpin` subcommand in CLI
- [x] Hook into session pinner unpin logic

## Testing

- [x] Add unit test for CLI command invocation

## Completion Criteria

- [x] All steps complete
- [x] Tests pass
