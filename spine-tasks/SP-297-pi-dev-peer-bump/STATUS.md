# SP-297: bump dev pi packages to ^1.3.0 — Status

**Current Step:** Complete
**Status:** Complete
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
**Status:** Complete

- [x] Run Contract testCommand — `npm run typecheck && npm run lint && npm test` green (145 files / 2347 tests); `npm run coverage:check` also green
- [x] Record minPiVersion decision

---

## Discoveries

- Current devDeps: `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` at `^0.85.1`; peerDeps are `*`; `pi.minPiVersion` is `0.85.1`.
- pi-ai 1.3 introduced a branded `TranscriptContext` (only `normalizeContext()` produces it) and added `SystemMessage` to the `Message` union.
- Type-drift fixes (no behavior change):
  - `delegate-stream.ts`: cast composed provider back to the structural `ComposedProviderLike` view so `provider.streamSimple(model, context, options)` keeps taking a plain `Context`. Runtime normalizes defensively (`Models.streamSimple` → `normalizeContext`), so behavior is unchanged on both old and new hosts.
  - `routing-context.ts`: handle `role === 'system'` in `mapContextMessages` (map to plain text routing message) so the final branch narrows to `ToolResultMessage`.

## Decisions

- **minPiVersion stays `0.85.1` (NOT bumped).** The ^1.3.0 change is devDependencies-only; peerDependencies remain `*` (host-provided). All type-drift fixes are type-level/additive: the extension still uses structural typing (`ComposedProviderLike`) and handles both old (`Message` without `SystemMessage`) and new hosts at runtime. No 1.3-only runtime API is required, so there is no reason to raise the minimum host version.
- Targeted range `^1.3.0` (not `^1.4.0`): 1.3.0 is the requested baseline; the range already resolves to the latest stable 1.4.0 in package-lock.
