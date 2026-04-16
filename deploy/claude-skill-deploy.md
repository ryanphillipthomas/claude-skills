name: deploy_ios_beta
description: >
  Create and trigger a Bitrise beta build for iOS. Automatically generates release notes
  from Jira tickets in commits and optionally allows manual additions.

inputs:
  confirm_non_develop:
    type: boolean
    description: "Allow running on non-develop branch"
    required: false
    default: false

  include_additional_notes:
    type: boolean
    description: "Prompt user to add additional release notes"
    required: false
    default: false

  bitrise_app_id:
    type: string
    description: "Bitrise app ID"
    required: true

  bitrise_token:
    type: string
    description: "Bitrise trigger token"
    required: true

  workflow_id:
    type: string
    description: "Bitrise workflow to run"
    required: false
    default: "deployBeta"

steps:
  - name: Get current branch
    run: |
      CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
      echo "Current branch: $CURRENT_BRANCH"

  - name: Validate branch
    run: |
      if [ "$CURRENT_BRANCH" != "develop" ]; then
        if [ "${{inputs.confirm_non_develop}}" != "true" ]; then
          echo "❌ Not on develop branch. Aborting."
          exit 1
        else
          echo "⚠️ Proceeding on non-develop branch: $CURRENT_BRANCH"
        fi
      fi

  - name: Fetch tags
    run: git fetch --tags

  - name: Extract Jira ticket IDs
    run: |
      LAST_TAG=$(git describe --tags --abbrev=0)
      TASK_IDS=$(git log --pretty=oneline $LAST_TAG..HEAD | grep -Eo '[A-Z]+-[0-9]+' | sort -u)

      if [ -z "$TASK_IDS" ]; then
        TASK_IDS=$(git log --pretty=oneline $LAST_TAG..HEAD --merges --first-parent | grep -Eo '[A-Z]+-[0-9]+' | sort -u)
      fi

      echo "TASK_IDS=$TASK_IDS" >> $GITHUB_ENV

  - name: Generate release notes
    run: |
      echo "" > release_notes.md

      if [ ! -z "$TASK_IDS" ]; then
        echo "JIRA Tickets:" >> release_notes.md
        for id in $TASK_IDS; do
          echo "- $id https://wheelsup.atlassian.net/browse/$id" >> release_notes.md
        done
      fi

  - name: Optional additional notes
    if: ${{inputs.include_additional_notes}}
    run: |
      echo "Add your notes to release_notes.md"
      ${EDITOR:-nano} release_notes.md

  - name: Commit changes
    run: |
      git add .
      git commit -m "Build Bot Version Bump"
      git push origin $CURRENT_BRANCH

  - name: Trigger Bitrise build
    run: |
      curl https://app.bitrise.io/app/${{inputs.bitrise_app_id}}/build/start.json \
        --data "{
          \"hook_info\": {
            \"type\": \"bitrise\",
            \"build_trigger_token\": \"${{inputs.bitrise_token}}\"
          },
          \"build_params\": {
            \"branch\": \"$CURRENT_BRANCH\",
            \"workflow_id\": \"${{inputs.workflow_id}}\"
          },
          \"triggered_by\": \"claude-skill\"
        }"