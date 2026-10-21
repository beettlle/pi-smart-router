# SP-297: bump dev pi packages to ^1.3.0 — Status

**Current Step:** Step 2: Testing & Verification
**Status:** In Progress
**Last Updated:** 2026-10-21
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm pi-ai / pi-coding-agent latest stable versions (1.4.0 on npm; `^1.3.0` range satisfies it)

---

### Step 1: Implementation
**Status:** Complete

- [x] Bump dev pi packages to ^1.3.0; npm install (resolved to 1.4.0 in package-lock)
- [x] Fix typecheck/test drift

---

### Step 2: Testing & Verification
**Status:** Not Started

- [ ] Run Contract testCommand
- [ ] Record minPiVersion decision

---

## Discoveries

- Current devDeps: `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` at `^0.85.1`; peerDeps are `*`; `pi.minPiVersion` is `0.85.1`.
- pi-ai 1.3 introduced a branded `TranscriptContext` (only `normalizeContext()` produces it) and added `SystemMessage` to the `Message` union.
- Type-drift fixes (no behavior change):
  - `delegate-stream.ts`: cast composed provider back to the structural `ComposedProviderLike` view so `provider.streamSimple(model, context, options)` keeps taking a plain `Context`. Runtime normalizes defensively (`Models.streamSimple` → `normalizeContext`), so behavior is unchanged on both old and new hosts.
  - `routing-context.ts`: handle `role === 'system'` in `mapContextMessages` (map to plain text routing message) so the final branch narrows to `ToolResultMessage`.
