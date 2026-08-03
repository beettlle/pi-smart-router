# SP-219: K=4 Top-1 + Offline A/B + Enablement Writeup — Status

**Current Step:** 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Top-1 + offline A/B measurements

**Status:** ⬜ Not Started

- [ ] Confirm SP-218 heads load or Partial path
- [ ] Top-1 / shortfall vs 0.1 on packs or documented proxy
- [ ] Offline A/B beyond fixture QR; archive measurements
- [ ] ECE PASS alone does not warrant K=4

**Plan-review checkpoint** — Sources + sample sizes recorded; no invented metrics.

## Step 2: Decision writeup + #96 link

**Status:** ⬜ Not Started

- [ ] Write modernbert-k4-top1-artifact.md with recommendation
- [ ] defaults.ts / release-gates.json unchanged
- [ ] Comment #96; close #114; leave #96 open

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Artifact complete
- [ ] Contract `testCommand`
- [ ] Related eval tests if touched
- [ ] verify:ci / coverage as applicable

---

## Completion Criteria

- [ ] Top-1 measured or blocker documented
- [ ] Offline A/B beyond fixtures (or proxy)
- [ ] Recommendation + #96 link; no default flip
- [ ] #114 closable; #96 open

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.16.0. Depends on SP-218. Soft parent #96.
