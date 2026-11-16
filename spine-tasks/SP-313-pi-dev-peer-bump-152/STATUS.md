# SP-313: bump dev pi packages to ^1.5.2 — Status

**Current Step:** All steps complete
**Status:** Complete
**Last Updated:** 2026-11-15
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm npm latest for pi-ai and pi-coding-agent is 1.5.2

---

### Step 1: Implementation
**Status:** Complete

- [x] Bump both devDependencies to ^1.5.2 and npm install
- [x] Fix typecheck/test drift if any

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Run Contract testCommand
- [x] Record pi.minPiVersion decision

## Verification
- Exact Contract testCommand passed: typecheck, lint, release:check, and `spine-stet-contract-run.sh lenient SP-313` (0 findings).
- Release verification passed 154 test files / 2,586 tests with 91.98% line coverage; consumer pack verified with `@earendil-works/pi-coding-agent@1.5.2`.
- `pi.minPiVersion` remains `0.85.1`: only development dependencies changed, runtime peer ranges remain `*`, and no type/API drift required a new runtime minimum.
