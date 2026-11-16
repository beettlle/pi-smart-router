# SP-316: benchmark-grounded capability row for Kimi K3.1 Pro — Status

**Current Step:** Step 3: Testing & Verification
**Status:** In Progress
**Last Updated:** 2026-11-15
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete (plan review engine-owned; worker spawn skipped)

- [x] Check leaderboard availability for K3.1 Pro scores

---

### Step 1: Ingest / curated row
**Status:** Complete (plan review engine-owned; worker spawn skipped)

- [x] Add row and/or fixture data

---

### Step 2: Aliases and provenance
**Status:** Complete (plan review engine-owned; worker spawn skipped)

- [x] Aliases + ungrounded provenance as needed

---

### Step 3: Testing & Verification
**Status:** In Progress

- [x] Alias/resolution tests + verify-benchmark-profiles
- [x] Run Contract testCommand

---

## Discoveries

- **2026-11-15 live preflight:** the official Terminal-Bench 4.0 page embeds Kimi K3.1 Pro at **59.7** (Claude Code, max; 2026-10-24), so this third-party value takes precedence over Moonshot's vendor-reported 65.7. Artificial Analysis also reports 67.2 and Vals AI reports 63.636 under different harnesses; use the official Terminal-Bench value to match the existing `terminal_bench` provenance.
- Moonshot's K3.1 announcement/model card reports **SWE-Marathon v1.1 51.7** (Claude Code harness). The official SWE-Marathon page has no K3.1 row, so this remains vendor-reported and will be sourced to the announcement, not presented as an independent leaderboard result.
- Live SWE-bench Verified, LiveCodeBench, and BFCL sources contain no K3.1/K3 rows. Do not substitute LiveBench, SWE-Marathon, HLE, BrowseComp, or MCP Atlas scores for those benchmark IDs.
- A Terminal-Bench-only row would be skipped for missing `code_gen`. Add a distinct `swe_marathon` fixture/source (reasoning + code_gen) alongside Terminal-Bench (reasoning + tool_use), yielding a complete row without inventing or cross-labeling scores.
- K3 has public Terminal-Bench results but no complete public source set for this artifact; leave K3/K3-256K on pattern defaults and document their scoped IDs as ungrounded.
- **STET triage:** dismissed `95af93f` as `wrong_suggestion` because bumping the artifact version would break the version-1 runtime mapper that this task explicitly forbids changing; the K3.1 row is an additive data/source expansion. Dismissed `d3ad6c8` as `wrong_suggestion` because the vendor announcement is the accurate provenance for the vendor-run SWE-Marathon score and replacing it with the official leaderboard (which has no K3.1 row) would falsify provenance.
- **STET false positives:** dismissed `9ec644b`, `8753121`, `45d75de`, `268e00f`, `806a89a`, `a71772f`, `420104f`, `a493300`, and `a724b5a`. Typecheck confirms `BenchmarkId` derives from the updated constant; tests confirm direct canonical-row lookup, four native adapters plus one curated stub, no default stub live URL, CLI snapshot creation, generic live mirror payloads, and per-benchmark fallback. The code_gen comment is specifically about K3/K3-256K, and ungrounded IDs are intentionally not alias-resolved.
