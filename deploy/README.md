# Deploy Verification Workspace

This workspace is for designing and building a safer iOS deploy flow that can verify whether a PR actually fixed a bug before beta deployment.

Current focus:

- define the verification workflow
- structure the repo for implementation
- prepare for simulator-based verification using `XCUITest`

## Layout

- [claude-skill-deploy.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/claude-skill-deploy.md:1)
  Existing deploy skill draft.

- [docs/DEPLOY_VERIFICATION_DESIGN.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/docs/DEPLOY_VERIFICATION_DESIGN.md:1)
  Overall design for verification-aware deployment.

- [docs/SNAPSHOT_COMPARISON_DESIGN.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/docs/SNAPSHOT_COMPARISON_DESIGN.md:1)
  Before/after evidence and snapshot comparison design.

- [scripts/README.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/scripts/README.md:1)
  Script directory purpose and conventions.

- [scripts/verify_fix.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/scripts/verify_fix.md:1)
  Proposed interface for the verification entry point.

- [scenarios/README.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/scenarios/README.md:1)
  Scenario structure for Jira-linked bug verification.

- [config/verification.example.env](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/config/verification.example.env:1)
  Example environment variables and secrets shape.

- [templates/summary.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/templates/summary.md:1)
  Template for human-readable verification reports.

## Recommended Next Steps

1. Create a sample scenario folder for one Jira ticket.
2. Turn `scripts/verify_fix.md` into an actual shell or Ruby script.
3. Define the `XCUITest` command shape the script will invoke.
4. Decide where baseline and candidate build artifacts will live.

## Notes From The Current App Repo

The current native iOS repo at `/Users/ryanthomas/Documents/GitHub/wu-ios-v2` appears to use:

- workspace: `Wheels Up/Wheels Up.xcworkspace`
- shared scheme: `Wheels Up`
- shared scheme: `Wheels Up Beta`
- UI test target included in scheme test actions: `WheelsUpUITests`

The local machine is currently configured with Command Line Tools as the active developer directory, but local runs can work by explicitly setting:

- `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
- a writable derived data path
- a writable cloned source packages path

Simulator access still depends on the host environment being allowed to talk to `CoreSimulatorService`.
