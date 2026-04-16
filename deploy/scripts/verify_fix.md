# `verify_fix` Interface

## Purpose

`verify_fix` is the orchestration entry point for bug-fix verification.

It is responsible for:

- resolving baseline and candidate refs
- building both refs for simulator testing
- running the same verification scenario against both builds
- collecting artifacts and metadata
- producing a final verification verdict

It is not responsible for:

- generating release notes
- committing code
- pushing branches
- triggering beta deployment directly

Those actions should remain outside this script.

## Inputs

The script should accept explicit inputs rather than infer state from the current branch.

Required inputs:

- `--jira-ticket`
  Example: `IOS-1234`

- `--verification-id`
  Example: `IOS-1234-login-error`
  May default to the Jira ticket in V1.

- `--baseline-ref`
  Example: `develop`

- `--candidate-ref`
  Example: `feature/fix-login-error`

- `--scenario-path`
  Example: `scenarios/IOS-1234`

Optional inputs:

- `--device-profile`
  Example: `iPhone 16`

- `--locale`
  Example: `en_US`

- `--timezone`
  Example: `America/New_York`

- `--test-environment`
  Example: `staging`

- `--artifact-output-dir`
  Example: `artifacts`

- `--verification-mode`
  Values: `required`, `warn`, `skip`

- `--execution-mode`
  Values: `local`, `bitrise`

- `--app-repo-path`
  Example: `/Users/ryanthomas/Documents/GitHub/wu-ios-v2`

- `--app-workspace`
  Example: `Wheels Up/Wheels Up.xcworkspace`

- `--app-project`
  Example: `Wheels Up/Wheels Up.xcodeproj`

- `--app-scheme`
  Example: `Wheels Up`

- `--test-scheme`
  Example: `Wheels Up`
  In many native iOS apps, UI tests run through the main shared app scheme.

- `--only-testing`
  Example: `WheelsUpUITests`
  Optional filter for narrowing the executed UI tests.

- `--developer-dir`
  Example: `/Applications/Xcode.app/Contents/Developer`
  Useful when the machine is pointed at Command Line Tools instead of full Xcode.

- `--cloned-source-packages-dir-path`
  Example: `/tmp/verify-fix-source-packages`
  Useful for keeping Swift package resolution in a writable location during local runs.

- `--build-workflow-id`
  Example: `build_for_verification`

- `--notes`
  Freeform operator context for the summary report.

## Environment Variables

The script may also read values from environment variables so CI can pass secrets safely.

Expected environment values:

- `BITRISE_APP_ID`
- `BITRISE_TOKEN`
- `TEST_USERNAME`
- `TEST_PASSWORD`

Rules:

- command-line flags should override defaults
- secrets should come from environment, not committed files
- missing required secrets should cause a fast failure with a non-secret error message

## Scenario Contract

The scenario referenced by `--scenario-path` should define:

- Jira ticket
- scenario id
- preconditions
- reproduction steps
- expected baseline behavior
- expected candidate behavior
- required assertions
- required artifacts

V1 assumption:

- one scenario path maps to one primary verification journey

## Execution Flow

The script should run in this order:

1. Validate inputs and secrets.
2. Resolve refs and record commit SHAs.
3. Build baseline ref for simulator testing.
4. Run the scenario against baseline.
5. Capture baseline logs, screenshots, and structured results.
6. Build candidate ref for simulator testing.
7. Run the same scenario against candidate.
8. Capture candidate logs, screenshots, and structured results.
9. Compare outcomes.
10. Write final metadata and summary artifacts.
11. Exit with a status code matching the verdict.

## Expected Outputs

The script should produce:

- a machine-readable result
- a human-readable summary
- artifact directories for baseline, candidate, and comparison

Suggested output structure:

```text
artifacts/
  <jira_ticket>/
    <verification_id>/
      baseline/
      candidate/
      comparison/
      verification-result.json
      summary.md
```

## Result Schema

The top-level result file should be JSON.

Suggested fields:

```json
{
  "jira_ticket": "IOS-1234",
  "verification_id": "IOS-1234-login-error",
  "baseline_ref": "develop",
  "candidate_ref": "feature/fix-login-error",
  "baseline_sha": "abc123",
  "candidate_sha": "def456",
  "verdict": "verified",
  "verification_mode": "required",
  "timestamp": "2026-04-16T15:00:00-04:00",
  "scenario_path": "scenarios/IOS-1234",
  "artifact_root": "artifacts/IOS-1234/IOS-1234-login-error",
  "notes": ""
}
```

## Verdicts

Supported verdicts:

- `verified`
  Baseline demonstrated the bug and candidate demonstrated the fix.

- `failed`
  Candidate did not prove the fix, or required execution failed.

- `inconclusive`
  The run completed but did not provide strong enough evidence.

- `skipped`
  Verification was intentionally skipped.

## Exit Codes

Suggested exit code policy:

- `0`
  `verified`

- `1`
  `failed`

- `2`
  `inconclusive`

- `3`
  `skipped`

- `4`
  configuration or secret error

This gives CI a simple integration path.

## Logging Convention

Every significant log line should include the Jira ticket and verification id.

Example:

```text
[IOS-1234][IOS-1234-login-error] Resolving refs
[IOS-1234][IOS-1234-login-error] Building baseline ref develop
[IOS-1234][IOS-1234-login-error] Baseline reproduced expected bug state
[IOS-1234][IOS-1234-login-error] Candidate passed expected assertions
[IOS-1234][IOS-1234-login-error] Final verdict=verified
```

Rules:

- never print secrets
- keep logs searchable by Jira ticket
- record exact refs and SHAs
- record artifact locations at the end

## XCUITest Assumption

For V1, the verification runner should assume the scenario is implemented with `XCUITest` against an iOS simulator.

That means `verify_fix` should focus on orchestration:

- selecting refs
- invoking build and test commands
- collecting outputs
- assembling artifacts and verdicts

It should not own the actual UI automation logic.

For native iOS projects that expose UI tests through the main app scheme, the expected command pattern is:

```text
xcodebuild -workspace <workspace> -scheme <app-scheme> -destination <simulator> -derivedDataPath <path> build-for-testing
xcodebuild -workspace <workspace> -scheme <test-scheme> -destination <simulator> -derivedDataPath <path> -clonedSourcePackagesDirPath <path> test-without-building -only-testing:<filter>
```

## Future Extensions

This interface should leave room for:

- multiple scenarios per Jira ticket
- device matrix execution
- richer screenshot diffing
- PR status reporting
- manual approval metadata

For V1, the interface should stay intentionally small and deterministic.
