# Task: SP-054 — Session Pinner SQLite

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Wire SessionPinner to SQLite StorePort in pi extension so pins survive restart.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#12
- Bucket: feature

## Mission

Session pins are in-memory only in the pi extension; they are lost on restart. SQLite already has a `pins` table via `StorePort`.

Tasks:
- Pass `SessionPinner` backed by extension `StorePort` into `createRouterFromFleet`
- Pins survive pi restart within same project
- Tests: pin holds across simulated session reload

## Dependencies

- SP-052

## Context to Read First

- `.pi/extensions/smart-router/index.ts` — `createExtensionStore()`, `new SessionPinner()` at ~line 1208
- `src/domain/pinning/session-pinner.ts` — in-memory Map today
- `src/infrastructure/persistence/sqlite-store.ts` — pins table CRUD
- `src/domain/types/store-port.ts`
- `tests/integration/session-pinning.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts`, `src/domain/pinning/session-pinner.ts` |
| May change | `src/infrastructure/persistence/sqlite-store.ts`, `tests/integration/session-pinning.test.ts`, `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/api/middleware/pi-router-middleware.ts`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Extension SessionPinner persists pins via StorePort; integration test confirms pin survives simulated session reload within same project. |

## Steps

### Step 1: Add StorePort backing to SessionPinner

- [ ] Extend SessionPinner to load/save pins through optional StorePort (or factory accepting store)
- [ ] Use existing sqlite-store pin methods; preserve in-memory fast path for tests without store

### Step 2: Wire extension to persisted pinner

- [ ] Pass extension `StorePort` from `createExtensionStore(cwd)` into SessionPinner construction
- [ ] Ensure `createRouterFromFleet` receives the same persisted pinner instance

### Step 3: Pin persistence integration test

- [ ] Add or extend integration test: pin set → simulate reload → pin still active
- [ ] Cover extension path (not only direct SessionPinner injection)

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Pins survive pi restart within same project/db path
- [ ] Extension wiring uses SQLite-backed pinner when store is active
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-054): description`

## Do NOT

- Change pin-break lifecycle rules (SP-051)
- Resolve middleware ghost layer (SP-055)
- Store prompt plaintext in pins table

---

## Amendments (Added During Execution)
