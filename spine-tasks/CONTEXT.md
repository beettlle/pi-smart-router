# pi-smart-router — Context

**Last Updated:** 2026-07-02
**Status:** Active
**Next Task ID:** SP-001

---

## Current State

Greenfield pi-spine project. Add phase tables and task rows as you decompose work from the PRD.

### Phase 0 — Bootstrap

| Task | Summary | Status | Deps |
|------|---------|--------|------|
| | | | |

---

## Execution policy

1. **Preflight** before every batch: `spine preflight` (see [pi-spine](https://github.com/beettlle/pi-spine) docs).
2. **Land loop:** `spine batch start` → monitor `spine status --diagnose` → `spine gate approve` → `spine integrate` → `spine batch complete`.
3. **Never** hand-edit `.spine/batch-state.json`.

---

