**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-05
**Review Level:** 1
**Size:** S

---

## Step 1: Rename duplicate stage

**Status:** ✅ Complete

- [x] Rename second triage stage to unique name
- [x] Update schema if needed (not required — `RoutingStageSchema` covers routing decisions; pipeline error telemetry uses internal stage names like `hardware_probe`)

## Step 2: Add regression test

**Status:** ✅ Complete

- [x] Assert correct failedStage for cloud fallback failure

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Run full testCommand

## Completion Criteria

- [x] All steps complete
- [x] Telemetry reports correct stage name
