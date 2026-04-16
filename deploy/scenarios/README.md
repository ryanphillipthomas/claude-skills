# Scenarios

This directory stores verification scenarios used to prove a bug exists in a baseline build and is fixed in a candidate build.

Each scenario should define:

- a stable scenario id
- the associated Jira ticket
- preconditions
- reproduction steps
- expected baseline behavior
- expected candidate behavior
- required artifacts

Suggested layout:

```text
scenarios/
  IOS-1234/
    scenario.md
    metadata.json
```

For V1, prefer one primary scenario per Jira ticket so logs, artifacts, and verification summaries stay easy to follow.
