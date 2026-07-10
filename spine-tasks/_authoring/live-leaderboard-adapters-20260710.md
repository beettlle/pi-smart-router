# Live leaderboard adapters — authoring plan (2026-07-10)

**Issue:** [#104](https://github.com/beettlle/pi-smart-router/issues/104)  
**Next IDs:** SP-181–SP-185  
**Root cause:** SP-179 `--live` fetches HTML human pages and fail-fasts on first error.

## Sources (verified)

| Benchmark | Live source | Score field |
|-----------|-------------|-------------|
| swebench_verified | `https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json` → board `Verified` | `resolved` |
| livecodebench | `https://raw.githubusercontent.com/LiveCodeBench/livecodebench.github.io/main/src/mocks/performances_generation.json` | aggregate `pass@1` per `model` / `model_repr` |
| bfcl | `https://raw.githubusercontent.com/ShishirPatil/gorilla/gh-pages/data_overall.csv` | `Overall Acc` |
| terminal_bench | TBD in SP-185 (no free stable JSON yet; Parse API needs key; HF is submissions) | TBD |

## Packet waves

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-181 | Fallback + adapter interface + stubs |
| B | SP-182, SP-183, SP-184 | Parallel — one adapter file each |
| C | SP-185 | Terminal-Bench source lock + adapter |

## Non-goals

- Inventing scores
- Paid Parse API as default
- Hosting our own mirrors as primary live source
