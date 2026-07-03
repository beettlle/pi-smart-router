**Current Step:** Step 1: Contract tests
**Status:** In Progress
**Last Updated:** 2026-07-02
**Review Level:** 1
**Size:** S

---

## Step 1: Contract tests

**Status:** In Progress

- [x] T018: routing-schemas.test.ts

## Step 2: Testing and verification

**Status:** Not Started

- [ ] Run `npm run typecheck && npm test`

---

## Discoveries

- **Schema drift (minor):** Zod `RoutingDecisionSchema` has `pin_reason: PinReasonSchema.nullable()` (required but nullable), while JSON schema `routing-decision.schema.json` lists `pin_reason` as optional (not in `required` array). Tests use `pin_reason: null` in minimal fixtures to satisfy both validators. Consider aligning by making the Zod field `.nullable().optional()` or adding `pin_reason` to the JSON schema's `required` array.

## Notes

SP-006 (S) — contract-tests
