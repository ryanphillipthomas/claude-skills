# Scenario: IOS-1234 Login Error Banner

## Summary

Verify that the login flow no longer shows an incorrect error banner after valid credentials are submitted.

## Jira Ticket

- `IOS-1234`

## Scenario ID

- `IOS-1234-login-error-banner`

## Preconditions

- The app is built for iOS simulator.
- The test environment is available and stable.
- A dedicated test account exists with known valid credentials.
- The simulator is configured with a stable locale and timezone.
- Any first-launch prompts or permissions are already handled by the test flow.

## Baseline Expectation

When valid credentials are submitted in the baseline build, the app incorrectly displays an error banner instead of completing login successfully.

## Candidate Expectation

When valid credentials are submitted in the candidate build, the error banner does not appear and the user lands on the expected post-login screen.

## Reproduction Steps

1. Launch the app.
2. Wait for the login screen to appear.
3. Enter the test username.
4. Enter the test password.
5. Tap the login button.
6. Observe the resulting screen state.

## Assertions

Required baseline assertions:

- login screen is visible before submission
- error banner is visible after submission
- home screen is not visible after submission

Required candidate assertions:

- login screen is visible before submission
- error banner is not visible after submission
- home screen is visible after submission

## Required Artifacts

- full-screen screenshot after login submission for baseline
- full-screen screenshot after login submission for candidate
- optional cropped screenshot around the error banner region
- structured assertion output for both runs
- scenario execution log for both runs

## Notes for XCUITest

Suggested accessibility identifiers:

- `login.username`
- `login.password`
- `login.submit`
- `login.errorBanner`
- `home.root`

Suggested screenshot points:

- `login-screen`
- `post-submit`

## Verdict Guidance

- `verified`
  Baseline shows the error banner and candidate reaches the home screen without the banner.

- `failed`
  Candidate still shows the error banner, fails to reach the home screen, or the scenario cannot be completed.

- `inconclusive`
  Baseline does not reproduce the bug clearly, or the app state is unstable enough that the evidence is weak.
