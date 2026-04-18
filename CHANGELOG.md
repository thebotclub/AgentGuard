# Changelog

All notable changes to AgentGuard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-04-18

### Security

- **JWT authentication hardening**: Eliminated plaintext fallback paths; all auth routes require valid JWT tokens
- **Console.log/error audit**: Reduced logging surface to prevent credential leakage in production logs
- **Rate limiting**: Added brute-force protection on authentication endpoints
- **Secret management**: Migrated to encrypted secrets storage

### Added

- **Health check improvements**: Consolidated health endpoint with component status reporting (DB, Redis)
- **Operational metrics**: New Prometheus-compatible metrics endpoints for monitoring
- **Structured logging**: Standardized pino JSON logging across all services
- **Dashboard CI pipeline**: Fixed Dockerfile syntax and build pipeline for dashboard container

### Changed

- **API version bump**: Unified all package versions to 0.10.0 (root, SDK, CLI)
- **OpenAPI spec**: Updated `info.version` to 0.10.0; aligned health check example versions
- **Documentation consolidation**: Moved planning artifacts to `docs/internal/planning/`
- **SDK API**: Canonicalized `evaluate()` to use `{ tool, params }` interface (removed legacy `{ tool, action, input }` from examples)

### Documentation

- Fixed all README and docs examples to use correct `{ tool, params }` API shape
- Moved unique content from `docs-site/` (log forwarding guide) and `vitepress-docs/` (API overview, troubleshooting) to canonical `docs/` location
- Added deprecation notices to `docs-site/` and `vitepress-docs/` pointing to `docs/`
- Migrated root-level planning artifacts (PLAN.md, AUDIT.md, CX_AUDIT.md, etc.) to `docs/internal/planning/`

### Fixed

- Dashboard Dockerfile `COPY` syntax error causing build failures
- npm install fallback for containerized deployments (npm ci → npm install)
- Safari `backdrop-filter` CSS prefix for dashboard UI
- TypeScript strictness and deprecation warnings

---

## [0.9.2] - 2026-03

### Fixed

- Hotfix release addressing deployment stability issues

## [0.9.0] - 2026-03

### Added

- **PII Detection & Redaction**: 9 entity types with detect/redact/mask modes
- **OWASP Agentic Top 10**: Initial compliance mapping and controls
- **Slack Human-in-the-Loop**: Approval workflow via Slack integration
- **Multi-Agent A2A**: Agent-to-agent policy inheritance and evaluation
- **Analytics Dashboard**: Usage analytics and reporting endpoints
- **SDK Telemetry**: Anonymous usage tracking in SDK

### Security

- Security headers (CSP, HSTS, X-Frame-Options)
- SSL/TLS configuration enforcement
- Config abstraction for sensitive values
