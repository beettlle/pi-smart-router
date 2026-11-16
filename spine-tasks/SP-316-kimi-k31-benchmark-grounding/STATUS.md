# SP-316: benchmark-grounded capability row for Kimi K3.1 Pro — Status

**Current Step:** Step 0: Preflight
**Status:** In Progress
**Last Updated:** 2026-11-15
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** In Progress

- [x] Check leaderboard availability for K3.1 Pro scores

---

### Step 1: Ingest / curated row
**Status:** Not Started

- [ ] Add row and/or fixture data

---

### Step 2: Aliases and provenance
**Status:** Not Started

- [ ] Aliases + ungrounded provenance as needed

---

### Step 3: Testing & Verification
**Status:** Not Started

- [ ] Alias/resolution tests + verify-benchmark-profiles
- [ ] Run Contract testCommand

---

## Discoveries

- **2026-11-15 live preflight:** the official Terminal-Bench 4.0 page embeds Kimi K3.1 Pro at **59.7** (Claude Code, max; 2026-10-24), so this third-party value takes precedence over Moonshot's vendor-reported 65.7. Artificial Analysis also reports 67.2 and Vals AI reports 63.636 under different harnesses; use the official Terminal-Bench value to match the existing `terminal_bench` provenance.
- Moonshot's K3.1 announcement/model card reports **SWE-Marathon v1.1 51.7** (Claude Code harness). The official SWE-Marathon page has no K3.1 row, so this remains vendor-reported and will be sourced to the announcement, not presented as an independent leaderboard result.
- Live SWE-bench Verified, LiveCodeBench, and BFCL sources contain no K3.1/K3 rows. Do not substitute LiveBench, SWE-Marathon, HLE, BrowseComp, or MCP Atlas scores for those benchmark IDs.
- A Terminal-Bench-only row would be skipped for missing `code_gen`. Add a distinct `swe_marathon` fixture/source (reasoning + code_gen) alongside Terminal-Bench (reasoning + tool_use), yielding a complete row without inventing or cross-labeling scores.
- K3 has public Terminal-Bench results but no complete public source set for this artifact; leave K3/K3-256K on pattern defaults and document their scoped IDs as ungrounded.
