# Scripts

This directory holds the orchestration scripts for deploy verification and beta deployment.

Planned contents:

- `verify_fix`
  Builds baseline and candidate refs, runs the verification scenario, and produces a verdict.
  V1 should support local `xcodebuild` execution before Bitrise integration.

- `deploy_ios_beta`
  Triggers the beta deployment flow after verification passes.

- artifact helpers
  Collect logs, screenshots, metadata, and summary output.

Guidelines:

- Keep scripts focused on orchestration, not business logic.
- Prefer explicit inputs over hard-coded branch assumptions.
- Never log secrets or tokens.
- Avoid auto-commit and auto-push behavior in deploy scripts.
