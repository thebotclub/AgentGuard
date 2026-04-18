# VitePress Docs — Incomplete Migration

This directory contains a partial VitePress documentation site.
It is **not canonical** — all content is derived from [`docs/`](../docs/).

## Current Status

The canonical documentation content lives in the top-level [`docs/`](../docs/) directory.

### Unique Content Migrated Out

The following unique content has been moved to canonical locations:

| Original | Moved To |
|----------|----------|
| `api/overview.md` | [`docs/api-reference/API_OVERVIEW.md`](../docs/api-reference/API_OVERVIEW.md) |
| `api/swagger.md` | [`docs/api-reference/SWAGGER.md`](../docs/api-reference/SWAGGER.md) |
| `api/spec-download.md` | [`docs/api-reference/SPEC_DOWNLOAD.md`](../docs/api-reference/SPEC_DOWNLOAD.md) |
| `getting-started/troubleshooting.md` | [`docs/getting-started/TROUBLESHOOTING.md`](../docs/getting-started/TROUBLESHOOTING.md) |

### Remaining Pages

These pages overlap with content in `docs/` and are kept for reference until the VitePress migration is complete:

- `guide/introduction.md` → overlaps with `docs/FEATURE_MATRIX.md`
- `guide/getting-started.md` → overlaps with `docs/SELF_HOSTED.md`
- `getting-started/quickstart.md` → overlaps with `README.md`
- `getting-started/architecture.md` → overlaps with `docs/ARCHITECTURE.md`
- `architecture/overview.md` → same as `docs/ARCHITECTURE.md`

### Missing Pages (20 sidebar references without files)

`guide/configuration.md`, `guide/policy-engine.md`, `guide/kill-switch.md`,
`guide/audit-trail.md`, `guide/pii-detection.md`, `guide/sdk-typescript.md`,
`guide/sdk-python.md`, `guide/mcp-servers.md`, `api/authentication.md`,
`api/evaluate.md`, `api/agents.md`, `api/audit.md`, `api/policy.md`,
`api/approvals.md`, `api/analytics.md`, `architecture/policy-engine.md`,
`architecture/deployment.md`, `security/compliance.md`, `security/pentest.md`,
`changelog.md`

## Path Forward

1. Content from `docs/` should be migrated into VitePress format here
2. Once all sidebar pages exist, this becomes the canonical web docs site
3. `docs/` remains the raw content source until the migration is complete
