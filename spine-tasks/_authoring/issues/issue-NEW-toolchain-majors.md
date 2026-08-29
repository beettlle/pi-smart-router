# Issue draft — toolchain majors (deferred from v0.19.3)

**Title:** deps: P3 — upgrade toolchain majors: typescript 7, vitest 4, @types/node 26
**Labels:** enhancement,priority/P3
**Created:** 2026-08-29 (v0.19.3 release cycle deferral)

## Summary

Dev-dependency majors are behind npm current and were deferred from the v0.19.3 stability patch (toolchain regressions are disproportionate risk for a patch):

| Package | Current | Latest |
|---|---|---|
| `typescript` | `^5.8.3` (5.9.3 installed) | **7.0.2** |
| `vitest` (+`@vitest/coverage-v8`) | `^3.2.3` (3.2.6 installed) | **4.1.11** |
| `@types/node` | `^22.15.21` | **26.4.0** |

## Why it matters

- TS 7 (native port line) brings large build-speed gains but stricter/default-changed inference — typecheck fixes likely across `src/**`.
- Vitest 4 changes workspace/coverage-v8 behaviors; our `vitest.config.ts` uses `maxWorkers` capping and coverage thresholds that need re-verification.
- `@types/node` should track the CI/runtime Node line (CI runs current Node; local dev on 26.x) once `engines.node` floor policy from #154 is settled.

## Scope

- Bump all three (typescript, vitest + @vitest/coverage-v8, @types/node) + fix type errors
- Re-verify `vitest.config.ts` semantics (worker caps, coverage thresholds 50/50/45/50)
- Confirm `release:check`, eslint 8 interop, and `tsconfig.build.json` still behave; adjust configs as needed
- Consider splitting into 2–3 spine tasks (TS7 alone is likely M)

## Acceptance criteria

- [ ] `npm run typecheck` green on TS 7
- [ ] `npm test` green on vitest 4 (full suite, no new flakes)
- [ ] Coverage thresholds still enforced (not silently dropped)
- [ ] `npm run release:check` exit 0
- [ ] No eslint breakage (if TS7 forces eslint tooling changes, file follow-up; eslint flat-config modernization already tracked in #157)

## Suggested task shape

M-sized at minimum; sequence after the better-sqlite3 v13 ticket to avoid double `package-lock.json` churn in one wave.
