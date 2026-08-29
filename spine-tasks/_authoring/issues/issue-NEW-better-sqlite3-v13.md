# Issue draft — better-sqlite3 v13 (deferred from v0.19.3)

**Title:** deps: P2 — upgrade better-sqlite3 to v13 (+ @types/better-sqlite3 v9)
**Labels:** enhancement,priority/P2
**Created:** 2026-08-29 (v0.19.3 release cycle deferral)

## Summary

`better-sqlite3` is pinned at `^12.11.1` (12.11.1 installed); **v13.0.3** is current on npm. `@types/better-sqlite3` is at `^7.6.13` while v9.6.0 is current (types major tracks the runtime major). Deferred from the v0.19.3 stability patch because a **native-module major bump** needs its own validation window (rebuild across Node versions/platforms, prepared-statement and BigInt behavior review).

## Why it matters

- v13 is the maintained line; v12 will stop receiving fixes.
- Types/runtime major mismatch (7 vs 12) already drifts today and compounds at 13.
- Native rebuild failures are the #1 install-support class for this package (SQLite persistence is core).

## Scope

- `better-sqlite3` `^12.11.1` → `^13.0.3` (package.json + lockfile rebuild)
- `@types/better-sqlite3` `^7.6.13` → `^9.6.0`
- Run `src/infrastructure/persistence/**` test pass; verify write-queue/session-pinner integration tests
- Verify `release:check` consumer pack installs and rebuilds cleanly on macOS arm64 + one Linux

## Acceptance criteria

- [ ] Both bumps applied; `npm install` clean rebuild; no engine warnings beyond current `engines.node` floor
- [ ] `sqlite-store`, `write-queue`, `session-pinner` suites green
- [ ] `npm run release:check` exit 0
- [ ] Any v13 API/breaking changes documented in the task STATUS (or PR notes)

## Suggested task shape

Single S/M spine task; pair with the toolchain-majors ticket (#next) or keep independent. File-scope: `package.json`, `package-lock.json`, optionally `src/infrastructure/persistence/**` if v13 API adjustments are needed.
