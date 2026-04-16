# Deploy Verification Design

## Goal

Design a deploy workflow that does more than trigger a build. The workflow should:

1. Build the candidate PR.
2. Confirm the reported bug can be reproduced in a baseline build.
3. Confirm the same scenario is fixed in the PR build.
4. Capture before/after artifacts for human review.
5. Gate deploy or beta promotion based on verification results.

This design assumes the current `deploy_ios_beta` script is a starting point, not a trusted production workflow yet.

## Problem Statement

The current script focuses on branch checks, release notes, and triggering Bitrise. It does not answer the most important release question:

Did this PR actually fix the bug it claims to fix?

To answer that, the deploy process needs an explicit verification stage with reproducible evidence. A successful build alone is not sufficient.

## Current Script Gaps

The existing flow in [claude-skill-deploy.md](/Users/ryanthomas/Documents/GitHub/claude-skills/deploy/claude-skill-deploy.md:1) has several limitations:

- It triggers a build but does not validate the bug fix.
- It assumes shell variables will persist across steps.
- It writes to `GITHUB_ENV`, which may not exist in the intended runtime.
- It auto-commits and pushes, which is risky for a deploy workflow.
- It does not produce artifacts that compare buggy vs fixed behavior.
- It mixes release note generation and deploy triggering with no verification gate.

## Proposed Workflow

The new workflow should be split into clear stages:

1. Resolve refs
   Identify the baseline ref and candidate ref.

2. Build baseline
   Produce an app artifact from the ref where the bug should still exist.

3. Build candidate
   Produce an app artifact from the PR branch or merge ref containing the fix.

4. Run reproduction scenario
   Execute the same deterministic scenario against both artifacts.

5. Capture evidence
   Save screenshots, logs, and structured outputs for both runs.

6. Compare results
   Generate a pass/fail decision and a reviewable diff summary.

7. Trigger deploy
   Only trigger Bitrise beta deployment after verification passes or is manually overridden.

## Baseline and Candidate Definitions

The workflow should support explicit refs instead of assuming `develop`.

- `baseline_ref`
  The commit or branch expected to still contain the bug.
  Usually the PR base branch, merge base, or last release branch.

- `candidate_ref`
  The PR branch, merge ref, or commit under test.

- `verification_id`
  A stable identifier for the bug scenario, such as a Jira ticket or scenario slug.

This makes the workflow reusable across bug fixes and not tightly coupled to one branching strategy.

## Verification Model

Each bug fix should define a reproducible scenario.

Required parts:

- Preconditions
  Data, account state, feature flags, device configuration, or environment setup.

- Steps
  The exact user or system actions needed to reproduce the issue.

- Assertions
  What proves the bug exists in baseline and is fixed in candidate.

- Evidence
  What gets captured for review: screenshots, logs, JSON output, video, or metrics.

Example decision rule:

- Baseline should fail the scenario or show the buggy state.
- Candidate should pass the scenario or show the corrected state.
- If both baseline and candidate pass, the test may not prove the fix.
- If both baseline and candidate fail, the fix is not verified.

## Artifact Model

Every verification run should produce artifacts in a predictable structure:

```text
artifacts/
  <verification_id>/
    baseline/
      build-metadata.json
      screenshot.png
      run.log
      result.json
    candidate/
      build-metadata.json
      screenshot.png
      run.log
      result.json
    comparison/
      summary.md
      diff.json
      diff.png
```

Recommended artifact contents:

- `build-metadata.json`
  Commit SHA, branch, build timestamp, app version, workflow id.

- `run.log`
  Scenario execution log with timestamps.

- `result.json`
  Structured outcome such as `status`, assertions, and measured values.

- `summary.md`
  Human-readable conclusion for the PR or deploy reviewer.

## Pass/Fail Rules

The verification stage should fail unless all required conditions are met:

- Baseline run completed successfully enough to evaluate the bug state.
- Candidate run completed successfully enough to evaluate the fixed state.
- At least one assertion demonstrates a meaningful before/after difference.
- Required artifacts were uploaded.

Optional override modes:

- `warn`
  Continue but mark verification inconclusive.

- `manual_approve`
  Require a reviewer to accept the evidence before deploy.

The default should be strict failure for missing evidence.

## Where Each Part Runs

Recommended ownership split:

- Local or CI preflight
  Resolve refs, validate inputs, assemble scenario config.

- Bitrise build workflows
  Produce installable baseline and candidate artifacts.

- Verification runner
  Run test scenarios and collect evidence.
  This could live in Bitrise, a dedicated CI job, or a device farm workflow.

- Reporting layer
  Publish artifact links and summary back to the PR or build record.

## Suggested Inputs

The next version of the deploy flow should accept inputs closer to these:

- `baseline_ref`
- `candidate_ref`
- `verification_id`
- `verification_mode`
  Values: `required`, `warn`, `skip`
- `artifact_bucket` or artifact destination
- `bitrise_app_id`
- `bitrise_token`
- `build_workflow_id`
- `deploy_workflow_id`

Optional:

- `device_profile`
- `locale`
- `feature_flags`
- `manual_notes`

## Rollout Plan

Implement this in phases to reduce risk.

### Phase 1: Script hardening

Goals:

- Remove auto-commit and auto-push behavior.
- Make branch/ref handling explicit.
- Separate release note generation from deploy logic.
- Confirm Bitrise trigger works reliably.

Exit criteria:

- The workflow can trigger a candidate build safely and predictably.

### Phase 2: Verification summary without visual diff

Goals:

- Add baseline and candidate build support.
- Add scenario execution hooks.
- Save logs and machine-readable results.
- Produce a pass/fail summary.

Exit criteria:

- The workflow can prove a bug reproduces before and passes after for at least one scenario.

### Phase 3: Snapshot comparison

Goals:

- Capture screenshots or other snapshots from both runs.
- Generate artifact diffs.
- Attach visual evidence to the summary.

Exit criteria:

- Reviewers can inspect before/after evidence directly from the build output.

### Phase 4: PR gating

Goals:

- Block deployment or merge promotion when verification fails.
- Surface status in the PR.

Exit criteria:

- The deploy step acts as an enforcement gate, not just a reporting job.

## Open Questions

- What runtime will execute the verification scenario: simulator, physical device, or hosted device farm?
- Are the target bugs primarily UI regressions, functional workflow bugs, or backend/data issues?
- Does the team want to compare against the PR base branch, merge-base commit, or last released build?
- Where should artifacts live so reviewers can access them easily?
- Does every bug fix need a custom scenario, or should there be a shared scenario catalog?

## Recommendation

Start by redesigning the deploy script into two logical units:

- `verify_fix`
  Builds baseline and candidate, runs the scenario, stores artifacts, and returns a decision.

- `deploy_ios_beta`
  Generates release notes and triggers Bitrise deploy only after verification passes.

This separation keeps verification auditable and makes deploy behavior simpler and safer.

## Native iOS Tooling Recommendation

Because the target app is a native Apple app, the default verification framework should be `XCUITest`.

Why `XCUITest` is the best fit:

- It is Apple-native and designed for iOS simulator automation.
- It integrates directly with Xcode build and test workflows.
- It supports UI assertions through the standard testing stack.
- It supports screenshots and test attachments for evidence capture.
- It keeps the verification system aligned with the platform instead of layering in extra runtime dependencies too early.

Recommended implementation direction:

- Use `XCUITest` to automate the reproduction scenario on simulator.
- Run the same test scenario against `baseline_ref` and `candidate_ref`.
- Capture screenshots and attachments from each run.
- Export a small summary artifact that the deploy workflow can interpret as `verified`, `failed`, or `inconclusive`.

This keeps the custom work focused on orchestration and reporting rather than inventing a new simulator automation framework.

## Alternative Tooling

`Maestro` is the main fallback option if the team wants a faster, more black-box style workflow for scenario authoring.

Reasons to consider `Maestro`:

- Flow definitions are generally faster to author.
- It works well for device-level scripted journeys.
- It has built-in screenshot capture and screenshot assertions.

Reasons not to make it the default here:

- The app is native iOS, so `XCUITest` has a stronger long-term platform fit.
- `XCUITest` is more naturally aligned with existing Apple tooling, simulator handling, and test reporting.
- Starting with `XCUITest` reduces the number of moving parts in the first implementation.

Recommendation:

- Default to `XCUITest` for V1.
- Revisit `Maestro` later only if scenario authoring speed becomes the main bottleneck.
