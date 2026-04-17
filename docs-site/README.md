# DEPRECATED

This directory is **deprecated** and no longer maintained.

The canonical documentation lives in the top-level [`docs/`](../docs/) directory.

This `docs-site/` directory contains the legacy static HTML documentation site
that was used before the VitePress migration. It is superseded by:

- **Raw documentation**: [`docs/`](../docs/) — all architecture, security, ops, and compliance docs
- **Web docs site**: [`vitepress-docs/`](../vitepress-docs/) — VitePress-powered documentation website

Do not add new content here. Any unique content remaining in this directory
(e.g., `guides/log-forwarding.md`, favicon assets) should be migrated to
`docs/` or `vitepress-docs/` before this directory is removed.
