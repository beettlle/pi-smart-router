# Dependency freshness (pi-smart-router)

Run during **Phase 1** of every release (all profiles). Record results in the release manifest before scope approval. Do **not** default to updating all dependencies on every minor+.

## Why

Runtime peers (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`) move quickly. A check keeps drift visible. Blind bulk bumps steal theme budget and couple feature trains to unrelated toolchain risk.

## Phase 1 — inventory commands

From repo root:

```bash
npm outdated --long || true
node -p "JSON.stringify({deps:require('./package.json').dependencies,dev:require('./package.json').devDependencies},null,2)"
npm view @earendil-works/pi-ai version
npm view @earendil-works/pi-coding-agent version
```

Compare declared caret ranges in `package.json` to `npm view` / `npm outdated` latest.

## Required table packages (minimum)

| Tier | Packages |
|------|----------|
| **Runtime peers** | `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent` |
| **Runtime deps** | `@huggingface/transformers`, `better-sqlite3`, `yaml`, `zod` |
| **Notable tooling** | `typescript`, `vitest`, `eslint`, `tsx`, `@types/node` |

Manifest columns: **Package** | **Declared** | **npm latest** | **Action this train**.

Action values: `Current` | `Include SP-###` (or “Include S bump”) | `Defer #NNN` / next-train hygiene theme | `no bump` (in-range lag, operator declined).

## Action matrix (Phase 2)

| Lag type | Default action |
|----------|----------------|
| **Runtime peer drift** — declared caret behind npm latest for `pi-ai` / `pi-coding-agent` | **Include** Size-S hygiene/chore task (or Partial of open engines / #154-class issue) within total-task caps |
| **In-range lockfile lag only** — e.g. `zod` / `tsx` still satisfy caret | Include **only** if operator explicitly wants it; otherwise record `no bump` |
| **Majors / toolchain epics** — e.g. `better-sqlite3` major, TypeScript major, ESLint flat-config | **Defer** to hygiene theme or existing issues — never auto-force into an unrelated theme |
| **Patch profile** | Bump only under the hygiene exception (non-capability, one-line justification). If the bump changes user-facing capability, reclassify release as **minor** |

## Budget and theme rules

- Bump tasks count toward **total-task** caps (patch ≤8, minor ≤15).
- Bump tasks are **not** enhancements — they do **not** consume the minor 1–3 enhancement budget.
- Do **not** treat “deps outdated” as license to raise enhancement or total-task caps (anti-feature-magnet).
- Include bumps must not contradict the release theme unless the theme is explicitly hygiene/deps.
- Prefer successive thin trains over bolting majors onto a routing minor.

## Packet expectations (when Include)

| Item | Requirement |
|------|-------------|
| Size | **S** |
| Contract + Testing | Must include `npm run release:check` |
| Typical File Scope | `package.json`, `package-lock.json`, plus `engines` / `pi.minPiVersion` when peer bumps require alignment |
| Publish | **No** silent `npm update` at Phase 6 — bumps land as integrated SP-* before publish gates |

## Precedents

| Release | Pattern |
|---------|---------|
| v0.19.3 | Included SP-240 peer + lockfile hygiene under patch hygiene exception |
| v0.20.0 | Check-only table; operator chose no bumps that train |

Missing freshness table in the manifest → **FAIL** profile audit (do not approve scope).
