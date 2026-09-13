# SP-290: bump GHA to Node-24 runtimes — Status

**Current Step:** 2
**Status:** 🔵 In Progress
**Last Updated:** 2026-09-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Inventory workflow pins
  - Found: `actions/checkout@v4` (7 files, 9 uses), `actions/setup-node@v4` (7 files, 8 uses), `actions/github-script@v7` (release.yml), `actions/upload-artifact@v4` (twinrouterbench-full-nightly.yml)
- [x] Confirm latest Node-24-native action majors
  - `actions/checkout` v7 (v5+ runs on Node 24)
  - `actions/setup-node` v7 (v5+ runs on Node 24; v6 auto-cache breaking change N/A — workflows already set `cache: npm` explicitly and package.json has no `packageManager` field)
  - `actions/github-script` v9 (v8+ runs on Node 24)
  - `actions/upload-artifact` v7 (v6+ runs on Node 24)

---

### Step 1: Implementation
**Status:** ✅ Complete

- [x] Bump pins in all workflows
  - checkout@v4→v7, setup-node@v4→v7, github-script@v7→v9, upload-artifact@v4→v7 across all 7 workflow files
- [x] Leave engines/node-version unchanged
  - Verified: all `node-version:` pins (22 / 22.19.0) untouched; package.json engines not modified

---

### Step 2: Testing & Verification
**Status:** 🔵 In Progress

- [ ] Run npm run release:check
- [ ] Record versions in STATUS

---
