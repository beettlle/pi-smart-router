# SP-296: move host-provided pi-ai out of dependencies — Status

**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-10-19
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Not Started

- [ ] Confirm host-provided list from pi 1.3.0 resource-loader
- [ ] Trace CLI import graph for pi-ai value imports

---

### Step 1: Implementation
**Status:** Not Started

- [ ] Move pi-ai from dependencies to devDependencies; keep optional `*` peer
- [ ] npm install to sync package-lock.json
- [ ] Add tests/unit/package-host-deps.test.ts

---

### Step 2: Testing & Verification
**Status:** Not Started

- [ ] Run Contract testCommand
- [ ] Record CLI import-graph finding
