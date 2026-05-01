# Residual Cleanup

## Goal

Close residuals from the product activation deployment: make lint pass and retry production smoke verification.

## Scope

- Fix existing lint warnings that block `npm run lint`.
- Avoid unrelated behavior changes unless required by lint correctness.
- Re-run local verification and production smoke where network allows.

## Acceptance

- `npm run lint` passes.
- Relevant tests/typecheck/build still pass.
- Production smoke is attempted and result recorded.

## Result

- Lint warnings removed across API support files and tests.
- Local verification passed: lint, unit tests, E2E, typecheck, build.
- Production health smoke succeeded once (`/health` returned `0.10.0`); fuller signup smoke was retried but blocked by intermittent DNS resolution from the local runner.
