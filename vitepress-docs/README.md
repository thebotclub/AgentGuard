# VitePress Docs — Incomplete Migration

This directory contains the VitePress-powered documentation website.
It was created as part of a docs migration (see commit `feat(M3-34): migrate
docs to VitePress`) but the migration is **incomplete**.

## Current Status

The canonical documentation content lives in the top-level [`docs/`](../docs/)
directory (58K+ lines, 123 files). This VitePress site contains only a subset
of that content (~3.6K lines, 18 files).

### Missing Pages

The sidebar configuration (`.vitepress/config.mts`) references **20 pages that
do not exist** as files:

- `guide/configuration.md`, `guide/policy-engine.md`, `guide/kill-switch.md`
- `guide/audit-trail.md`, `guide/pii-detection.md`
- `guide/sdk-typescript.md`, `guide/sdk-python.md`, `guide/mcp-servers.md`
- `api/authentication.md`, `api/evaluate.md`, `api/agents.md`
- `api/audit.md`, `api/policy.md`, `api/approvals.md`, `api/analytics.md`
- `architecture/policy-engine.md`, `architecture/deployment.md`
- `security/compliance.md`, `security/pentest.md`
- `changelog.md`

## Build Scripts

The root `package.json` provides these scripts:

```
npm run docs:dev      # VitePress dev server
npm run docs:build    # Build static site
npm run docs:preview  # Preview built site
```

## Path Forward

1. Content from `docs/` should be migrated into VitePress format here
2. Once all sidebar pages exist, this becomes the canonical web docs site
3. `docs/` remains the raw content source until the migration is complete
