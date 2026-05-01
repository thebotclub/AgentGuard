# DNS Smoke Residual

## Goal

Close the remaining production verification residual: intermittent local DNS resolution failures while smoking `api.agentguard.tech`.

## Scope

- Diagnose whether public DNS is healthy.
- Add a reusable production smoke script that records resolver diagnostics.
- Make smoke calls resilient to local resolver flakes by falling back to public DNS A records with `curl --resolve`.
- Wire deploy checks to the shared script so CI and local verification exercise the same path.

## Acceptance

- Public DNS diagnostics are visible in smoke output.
- API health, authenticated evaluate, auth enforcement, playground, and site reachability checks can survive transient local resolver failure.
- Existing lint/typecheck/build/tests remain green for the changed surface.

## Result

- Added `scripts/production-smoke.sh` with resolver diagnostics, normal `curl` retries, and `curl --resolve` fallback from direct resolver/DoH A records.
- Updated Azure deploy health and smoke checks to use the shared script.
- Verified script syntax, whitespace, lint, and production smoke including signup canary.
