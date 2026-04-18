# Contributing to AgentGuard

AgentGuard is **source-available** under the [Business Source License 1.1 (BSL)](LICENSE). You are welcome to contribute, but please read the license terms before submitting code.

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+
git clone https://github.com/thebotclub/agentguard.git
cd agentguard
pnpm install
turbo build
turbo dev
```

You'll need a running PostgreSQL instance. Copy `.env.example` to `.env` and configure your database URL:

```bash
cp .env.example .env
```

## Monorepo Structure

| Path | Purpose |
|---|---|
| `packages/sdk` | Client SDK — embed AgentGuard into your agent runtime |
| `packages/api` | Shared API types, schemas, and Prisma client |
| `packages/dashboard` | Admin dashboard (Vite + React) |
| `packages/shared` | Shared utilities, types, and constants |
| `packages/compliance` | Compliance reporting and policy templates |
| `packages/cli` | CLI tool for policy management |
| `api/` | API server (Express, routes, middleware, services) |
| `tests/` | E2E and integration tests |

## Development Workflow

1. **Create a branch** off `main`: `git checkout -b feat/your-feature`
2. **Make changes** — run `turbo build` and `pnpm test` locally before pushing
3. **Open a PR** against `main` with a clear description of the change
4. **Address review** — codeowners will be auto-assigned based on files changed
5. **Merge** — squash merge is preferred

## Code Style

- **TypeScript strict mode** — all packages use `"strict": true`
- **2-space indentation**, UTF-8, LF line endings (see `.editorconfig`)
- **Logging** — use `pino` (never `console.log` in production code)
- **Testing** — `vitest` for unit tests, `tsx --test` for E2E. All new features need tests.
- **Linting** — run `pnpm lint` before pushing. CI enforces zero warnings.

```bash
pnpm lint          # check
pnpm lint:fix      # auto-fix
pnpm test          # unit tests
pnpm typecheck     # full typecheck across packages
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(scope): add policy versioning`
- `fix(api): resolve tenant isolation race condition`
- `docs: update architecture diagram`
- `chore: bump dependencies`

## Pull Request Process

- Keep PRs focused — one concern per PR
- Include tests for new behavior
- Update documentation if the change affects users or APIs
- CI must pass before merge (lint, typecheck, test, build)
- Breaking changes must be flagged in the PR description and bump the minor version

## Questions?

Open a [Discussion](https://github.com/thebotclub/agentguard/discussions) or reach out on the `#agentguard-dev` channel.
