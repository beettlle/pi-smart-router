# SP-308: Typed-judgment feature sidecar + composition-root wiring — Status

**Current Step:** Step 3: Testing & Verification
**Status:** In Progress
**Last Updated:** 2026-11-02
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm SP-305/SP-307 on main; read sidecar fixtures

---

### Step 1: Sidecar
**Status:** Complete

- [x] Types + strict zod + contract JSON; populate; omit when disabled

---

### Step 2: Composition root
**Status:** Complete

- [x] createDispatchOptions binds port; GatewayDispatch forwards

---

### Step 3: Testing & Verification
**Status:** In Progress

- [ ] Judged and skipped turn sidecars; no text fields
- [ ] Disabled → byte-identical fixtures
- [ ] Wiring: loopback port bound; remote without key fails closed
- [ ] Run Contract testCommand

---

## Discoveries

- `PipelineOptions` (SP-307) already declares `typedJudgmentPort` / `typedJudgmentConfig`;
  `GatewayDispatchOptions extends PipelineOptions` and `GatewayDispatch` spreads options into
  `RouterPipeline`, so no gateway-dispatch.ts change is needed (forwarding is structural).
- SP-307 `tests/unit/typed-judgment-stage.test.ts` "byte-identical when enabled" compares full
  decision objects; the SP-308 sidecar intentionally changes the enabled-path features payload,
  so that test needs a minimal update (exclude the new sidecar key) — flagged for reviewers.
