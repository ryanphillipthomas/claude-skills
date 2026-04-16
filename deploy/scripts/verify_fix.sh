#!/usr/bin/env bash

set -euo pipefail

VERDICT_VERIFIED=0
VERDICT_FAILED=1
VERDICT_INCONCLUSIVE=2
VERDICT_SKIPPED=3
VERDICT_CONFIG_ERROR=4

JIRA_TICKET=""
VERIFICATION_ID=""
BASELINE_REF=""
CANDIDATE_REF=""
SCENARIO_PATH=""
DEVICE_PROFILE="${DEVICE_PROFILE:-iPhone 16}"
LOCALE="${LOCALE:-en_US}"
TIMEZONE="${TIMEZONE:-America/New_York}"
TEST_ENVIRONMENT="${TEST_ENVIRONMENT:-staging}"
ARTIFACT_OUTPUT_DIR="${ARTIFACT_OUTPUT_DIR:-artifacts}"
VERIFICATION_MODE="${VERIFICATION_MODE:-required}"
BUILD_WORKFLOW_ID="${BUILD_WORKFLOW_ID:-build_for_verification}"
EXECUTION_MODE="${EXECUTION_MODE:-local}"
APP_REPO_PATH="${APP_REPO_PATH:-}"
APP_WORKSPACE="${APP_WORKSPACE:-}"
APP_PROJECT="${APP_PROJECT:-}"
APP_SCHEME="${APP_SCHEME:-}"
TEST_SCHEME="${TEST_SCHEME:-}"
ONLY_TESTING="${ONLY_TESTING:-}"
DEVELOPER_DIR_OVERRIDE="${DEVELOPER_DIR_OVERRIDE:-}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-}"
CLONED_SOURCE_PACKAGES_DIR_PATH="${CLONED_SOURCE_PACKAGES_DIR_PATH:-}"
SIMULATOR_DESTINATION="${SIMULATOR_DESTINATION:-}"
SKIP_PACKAGE_PLUGIN_VALIDATION="${SKIP_PACKAGE_PLUGIN_VALIDATION:-true}"
RUN_POD_INSTALL="${RUN_POD_INSTALL:-true}"
NOTES=""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date '+%Y-%m-%dT%H:%M:%S%z')"

usage() {
  cat <<'EOF'
Usage:
  verify_fix.sh --jira-ticket IOS-1234 \
    --baseline-ref develop \
    --candidate-ref feature/fix \
    --scenario-path scenarios/IOS-1234 \
    [--verification-id IOS-1234-login-error] \
    [--device-profile "iPhone 16"] \
    [--locale en_US] \
    [--timezone America/New_York] \
    [--test-environment staging] \
    [--artifact-output-dir artifacts] \
    [--verification-mode required] \
    [--execution-mode local] \
    [--app-repo-path /path/to/app] \
    [--app-workspace MyApp.xcworkspace] \
    [--app-project MyApp.xcodeproj] \
    [--app-scheme MyApp] \
    [--test-scheme MyApp] \
    [--only-testing MyAppUITests] \
    [--developer-dir /Applications/Xcode.app/Contents/Developer] \
    [--derived-data-path /tmp/verify-fix-derived-data] \
    [--cloned-source-packages-dir-path /tmp/verify-fix-source-packages] \
    [--simulator-destination "platform=iOS Simulator,name=iPhone 16"] \
    [--skip-package-plugin-validation true] \
    [--run-pod-install true] \
    [--build-workflow-id build_for_verification] \
    [--notes "optional note"]
EOF
}

log() {
  printf '[%s][%s] %s\n' "$JIRA_TICKET" "$VERIFICATION_ID" "$1"
}

fail_config() {
  printf 'Configuration error: %s\n' "$1" >&2
  exit "$VERDICT_CONFIG_ERROR"
}

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    fail_config "missing required value for $name"
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail_config "missing required environment variable $name"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --jira-ticket)
        JIRA_TICKET="${2:-}"
        shift 2
        ;;
      --verification-id)
        VERIFICATION_ID="${2:-}"
        shift 2
        ;;
      --baseline-ref)
        BASELINE_REF="${2:-}"
        shift 2
        ;;
      --candidate-ref)
        CANDIDATE_REF="${2:-}"
        shift 2
        ;;
      --scenario-path)
        SCENARIO_PATH="${2:-}"
        shift 2
        ;;
      --device-profile)
        DEVICE_PROFILE="${2:-}"
        shift 2
        ;;
      --locale)
        LOCALE="${2:-}"
        shift 2
        ;;
      --timezone)
        TIMEZONE="${2:-}"
        shift 2
        ;;
      --test-environment)
        TEST_ENVIRONMENT="${2:-}"
        shift 2
        ;;
      --artifact-output-dir)
        ARTIFACT_OUTPUT_DIR="${2:-}"
        shift 2
        ;;
      --verification-mode)
        VERIFICATION_MODE="${2:-}"
        shift 2
        ;;
      --execution-mode)
        EXECUTION_MODE="${2:-}"
        shift 2
        ;;
      --app-repo-path)
        APP_REPO_PATH="${2:-}"
        shift 2
        ;;
      --app-workspace)
        APP_WORKSPACE="${2:-}"
        shift 2
        ;;
      --app-project)
        APP_PROJECT="${2:-}"
        shift 2
        ;;
      --app-scheme)
        APP_SCHEME="${2:-}"
        shift 2
        ;;
      --test-scheme)
        TEST_SCHEME="${2:-}"
        shift 2
        ;;
      --only-testing)
        ONLY_TESTING="${2:-}"
        shift 2
        ;;
      --developer-dir)
        DEVELOPER_DIR_OVERRIDE="${2:-}"
        shift 2
        ;;
      --derived-data-path)
        DERIVED_DATA_PATH="${2:-}"
        shift 2
        ;;
      --cloned-source-packages-dir-path)
        CLONED_SOURCE_PACKAGES_DIR_PATH="${2:-}"
        shift 2
        ;;
      --simulator-destination)
        SIMULATOR_DESTINATION="${2:-}"
        shift 2
        ;;
      --skip-package-plugin-validation)
        SKIP_PACKAGE_PLUGIN_VALIDATION="${2:-}"
        shift 2
        ;;
      --run-pod-install)
        RUN_POD_INSTALL="${2:-}"
        shift 2
        ;;
      --build-workflow-id)
        BUILD_WORKFLOW_ID="${2:-}"
        shift 2
        ;;
      --notes)
        NOTES="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail_config "unknown argument $1"
        ;;
    esac
  done
}

validate_inputs() {
  require_value "--jira-ticket" "$JIRA_TICKET"
  require_value "--baseline-ref" "$BASELINE_REF"
  require_value "--candidate-ref" "$CANDIDATE_REF"
  require_value "--scenario-path" "$SCENARIO_PATH"

  if [[ -z "$VERIFICATION_ID" ]]; then
    VERIFICATION_ID="$JIRA_TICKET"
  fi

  case "$VERIFICATION_MODE" in
    required|warn|skip) ;;
    *)
      fail_config "unsupported verification mode $VERIFICATION_MODE"
      ;;
  esac

  case "$EXECUTION_MODE" in
    local|bitrise) ;;
    *)
      fail_config "unsupported execution mode $EXECUTION_MODE"
      ;;
  esac

  if [[ ! -d "$ROOT_DIR/$SCENARIO_PATH" && ! -d "$SCENARIO_PATH" ]]; then
    fail_config "scenario path not found: $SCENARIO_PATH"
  fi

  if [[ "$EXECUTION_MODE" == "local" ]]; then
    require_value "--app-repo-path" "$APP_REPO_PATH"
    require_value "--app-scheme" "$APP_SCHEME"

    if [[ -z "$APP_WORKSPACE" && -z "$APP_PROJECT" ]]; then
      fail_config "local execution requires either --app-workspace or --app-project"
    fi

    if [[ -z "$TEST_SCHEME" ]]; then
      TEST_SCHEME="$APP_SCHEME"
    fi
  fi
}

validate_environment() {
  if [[ "$VERIFICATION_MODE" == "skip" ]]; then
    return
  fi

  if [[ "$EXECUTION_MODE" == "bitrise" ]]; then
    require_env "BITRISE_APP_ID"
    require_env "BITRISE_TOKEN"
  fi
}

resolve_paths() {
  ARTIFACT_ROOT="$ROOT_DIR/$ARTIFACT_OUTPUT_DIR/$JIRA_TICKET/$VERIFICATION_ID"
  BASELINE_DIR="$ARTIFACT_ROOT/baseline"
  CANDIDATE_DIR="$ARTIFACT_ROOT/candidate"
  COMPARISON_DIR="$ARTIFACT_ROOT/comparison"
  RESULT_JSON="$ARTIFACT_ROOT/verification-result.json"
  SUMMARY_MD="$ARTIFACT_ROOT/summary.md"

  if [[ -z "$DERIVED_DATA_PATH" ]]; then
    DERIVED_DATA_PATH="$ARTIFACT_ROOT/derived-data"
  fi

  if [[ -z "$CLONED_SOURCE_PACKAGES_DIR_PATH" ]]; then
    CLONED_SOURCE_PACKAGES_DIR_PATH="$ARTIFACT_ROOT/source-packages"
  fi

  if [[ -z "$SIMULATOR_DESTINATION" ]]; then
    SIMULATOR_DESTINATION="platform=iOS Simulator,name=$DEVICE_PROFILE"
  fi
}

prepare_directories() {
  mkdir -p "$BASELINE_DIR" "$CANDIDATE_DIR" "$COMPARISON_DIR" "$DERIVED_DATA_PATH" "$CLONED_SOURCE_PACKAGES_DIR_PATH" "$ARTIFACT_ROOT/worktrees"
}

resolve_git_refs() {
  local repo_path="$ROOT_DIR"
  if [[ "$EXECUTION_MODE" == "local" ]]; then
    repo_path="$APP_REPO_PATH"
  fi

  BASELINE_SHA="$(git -C "$repo_path" rev-parse "$BASELINE_REF")"
  CANDIDATE_SHA="$(git -C "$repo_path" rev-parse "$CANDIDATE_REF")"
}

build_xcode_scope_args() {
  if [[ -n "$APP_WORKSPACE" ]]; then
    printf -- '-workspace %q ' "$APP_REPO_PATH/$APP_WORKSPACE"
  else
    printf -- '-project %q ' "$APP_REPO_PATH/$APP_PROJECT"
  fi
}

build_xcode_common_args() {
  if [[ "$SKIP_PACKAGE_PLUGIN_VALIDATION" == "true" ]]; then
    printf -- '-skipPackagePluginValidation '
  fi
}

build_xcode_prefix() {
  if [[ -n "$DEVELOPER_DIR_OVERRIDE" ]]; then
    printf -- 'DEVELOPER_DIR=%q xcodebuild ' "$DEVELOPER_DIR_OVERRIDE"
  else
    printf -- 'xcodebuild '
  fi
}

materialize_ref_snapshot() {
  local ref_sha="$1"
  local destination_dir="$2"

  rm -rf "$destination_dir"
  mkdir -p "$destination_dir"
  git -C "$APP_REPO_PATH" archive "$ref_sha" | tar -x -C "$destination_dir"
}

build_xcode_scope_args_for_repo() {
  local repo_dir="$1"

  if [[ -n "$APP_WORKSPACE" ]]; then
    printf -- '-workspace %q ' "$repo_dir/$APP_WORKSPACE"
  else
    printf -- '-project %q ' "$repo_dir/$APP_PROJECT"
  fi
}

run_command_logged() {
  local command_text="$1"
  local logfile="$2"

  printf 'Running command:\n%s\n\n' "$command_text" | tee "$logfile"
  bash -lc "$command_text" 2>&1 | tee -a "$logfile"
}

prepare_snapshot_dependencies() {
  local snapshot_dir="$1"
  local output_dir="$2"
  local ref_name="$3"
  local scope_args
  local common_args
  local xcodebuild_prefix
  local package_log="$output_dir/package-resolve.log"
  local pod_log="$output_dir/pod-install.log"
  local command_text=""
  local ref_source_packages_dir="$DERIVED_DATA_PATH/$ref_name/SourcePackages"

  mkdir -p "$ref_source_packages_dir"

  if [[ "$RUN_POD_INSTALL" != "true" ]]; then
    :
  elif [[ -f "$snapshot_dir/Wheels Up/Podfile" ]]; then
    command_text="cd '$snapshot_dir/Wheels Up' && bundle exec pod install"
    log "Running pod install for snapshot=$snapshot_dir"
    run_command_logged "$command_text" "$pod_log"
  fi

  scope_args="$(build_xcode_scope_args_for_repo "$snapshot_dir")"
  common_args="$(build_xcode_common_args)"
  xcodebuild_prefix="$(build_xcode_prefix)"

  command_text="${xcodebuild_prefix}${scope_args}${common_args}-clonedSourcePackagesDirPath '$ref_source_packages_dir' -scheme '$APP_SCHEME' -resolvePackageDependencies"
  log "Resolving Swift packages for snapshot=$snapshot_dir"
  run_command_logged "$command_text" "$package_log"
}

build_ref() {
  local ref_name="$1"
  local ref_sha="$2"
  local output_dir="$3"
  local snapshot_dir
  local scope_args
  local common_args
  local xcodebuild_prefix
  local command_text
  local ref_source_packages_dir

  if [[ "$EXECUTION_MODE" == "local" ]]; then
    snapshot_dir="$ARTIFACT_ROOT/worktrees/$ref_name"
    materialize_ref_snapshot "$ref_sha" "$snapshot_dir"
    prepare_snapshot_dependencies "$snapshot_dir" "$output_dir" "$ref_name"
    scope_args="$(build_xcode_scope_args_for_repo "$snapshot_dir")"
    common_args="$(build_xcode_common_args)"
    xcodebuild_prefix="$(build_xcode_prefix)"
    ref_source_packages_dir="$DERIVED_DATA_PATH/$ref_name/SourcePackages"
    command_text="${xcodebuild_prefix}${scope_args}${common_args}-clonedSourcePackagesDirPath '$ref_source_packages_dir' -scheme '$APP_SCHEME' -destination '$SIMULATOR_DESTINATION' -derivedDataPath '$DERIVED_DATA_PATH/$ref_name' build-for-testing"
    log "Building ref=$ref_name sha=$ref_sha from snapshot=$snapshot_dir"
    run_command_logged "$command_text" "$output_dir/build.log"
    return
  fi

  log "Bitrise build placeholder for ref=$ref_name output_dir=$output_dir workflow=$BUILD_WORKFLOW_ID"
  printf 'TODO: trigger Bitrise build for ref %s using workflow %s\n' "$ref_name" "$BUILD_WORKFLOW_ID" > "$output_dir/build.log"
}

run_scenario() {
  local mode_name="$1"
  local ref_name="$2"
  local ref_sha="$3"
  local output_dir="$4"
  local snapshot_dir
  local scope_args
  local common_args
  local xcodebuild_prefix
  local test_filter=""
  local command_text
  local ref_source_packages_dir

  if [[ "$EXECUTION_MODE" == "local" ]]; then
    snapshot_dir="$ARTIFACT_ROOT/worktrees/$ref_name"
    if [[ ! -d "$snapshot_dir" ]]; then
      materialize_ref_snapshot "$ref_sha" "$snapshot_dir"
    fi
    scope_args="$(build_xcode_scope_args_for_repo "$snapshot_dir")"
    common_args="$(build_xcode_common_args)"
    xcodebuild_prefix="$(build_xcode_prefix)"
    if [[ -n "$ONLY_TESTING" ]]; then
      test_filter="-only-testing:$ONLY_TESTING"
    fi

    if [[ -n "${TEST_USERNAME:-}" ]]; then
      export IOS1234_TEST_USERNAME="$TEST_USERNAME"
    fi

    if [[ -n "${TEST_PASSWORD:-}" ]]; then
      export IOS1234_TEST_PASSWORD="$TEST_PASSWORD"
    fi

    if [[ "$mode_name" == "baseline" ]]; then
      export IOS1234_EXPECT_ERROR_ALERT="1"
    else
      export IOS1234_EXPECT_ERROR_ALERT="0"
    fi

    ref_source_packages_dir="$DERIVED_DATA_PATH/$ref_name/SourcePackages"
    command_text="${xcodebuild_prefix}${scope_args}${common_args}-clonedSourcePackagesDirPath '$ref_source_packages_dir' -scheme '$TEST_SCHEME' -destination '$SIMULATOR_DESTINATION' -derivedDataPath '$DERIVED_DATA_PATH/$ref_name' test-without-building $test_filter"
    log "Running XCUITest for mode=$mode_name ref=$ref_name sha=$ref_sha"
    run_command_logged "$command_text" "$output_dir/run.log"
  else
    log "Bitrise scenario placeholder for mode=$mode_name ref=$ref_name scenario=$SCENARIO_PATH"
    printf 'TODO: run remote verification scenario for %s (%s)\n' "$mode_name" "$ref_name" > "$output_dir/run.log"
  fi

  cat > "$output_dir/result.json" <<EOF
{
  "mode": "$mode_name",
  "ref": "$ref_name",
  "status": "placeholder",
  "runner": "xcuitest",
  "scenario_path": "$SCENARIO_PATH",
  "execution_mode": "$EXECUTION_MODE"
}
EOF
}

compute_verdict() {
  if [[ "$VERIFICATION_MODE" == "skip" ]]; then
    VERDICT="skipped"
    RETURN_CODE="$VERDICT_SKIPPED"
    return
  fi

  VERDICT="inconclusive"
  RETURN_CODE="$VERDICT_INCONCLUSIVE"
}

write_summary() {
  cat > "$SUMMARY_MD" <<EOF
# Verification Summary

- Jira Ticket: \`$JIRA_TICKET\`
- Verification ID: \`$VERIFICATION_ID\`
- Baseline Ref: \`$BASELINE_REF\`
- Candidate Ref: \`$CANDIDATE_REF\`
- Baseline SHA: \`$BASELINE_SHA\`
- Candidate SHA: \`$CANDIDATE_SHA\`
- Verdict: \`$VERDICT\`
- Timestamp: \`$TIMESTAMP\`
- Execution Mode: \`$EXECUTION_MODE\`

## Scenario

\`$SCENARIO_PATH\`

## Notes

${NOTES:-No notes provided.}
EOF
}

write_result_json() {
  cat > "$RESULT_JSON" <<EOF
{
  "jira_ticket": "$JIRA_TICKET",
  "verification_id": "$VERIFICATION_ID",
  "baseline_ref": "$BASELINE_REF",
  "candidate_ref": "$CANDIDATE_REF",
  "baseline_sha": "$BASELINE_SHA",
  "candidate_sha": "$CANDIDATE_SHA",
  "verdict": "$VERDICT",
  "verification_mode": "$VERIFICATION_MODE",
  "execution_mode": "$EXECUTION_MODE",
  "timestamp": "$TIMESTAMP",
  "scenario_path": "$SCENARIO_PATH",
  "artifact_root": "$ARTIFACT_ROOT",
  "app_repo_path": "$APP_REPO_PATH",
  "app_workspace": "$APP_WORKSPACE",
  "app_project": "$APP_PROJECT",
  "app_scheme": "$APP_SCHEME",
  "test_scheme": "$TEST_SCHEME",
  "only_testing": "$ONLY_TESTING",
  "developer_dir_override": "$DEVELOPER_DIR_OVERRIDE",
  "derived_data_path": "$DERIVED_DATA_PATH",
  "cloned_source_packages_dir_path": "$CLONED_SOURCE_PACKAGES_DIR_PATH",
  "skip_package_plugin_validation": "$SKIP_PACKAGE_PLUGIN_VALIDATION",
  "run_pod_install": "$RUN_POD_INSTALL",
  "simulator_destination": "$SIMULATOR_DESTINATION",
  "device_profile": "$DEVICE_PROFILE",
  "locale": "$LOCALE",
  "timezone": "$TIMEZONE",
  "test_environment": "$TEST_ENVIRONMENT",
  "notes": "$NOTES"
}
EOF
}

main() {
  parse_args "$@"
  validate_inputs
  validate_environment
  resolve_paths
  prepare_directories

  log "Starting verification"
  log "Resolving refs"
  resolve_git_refs

  log "Building baseline ref $BASELINE_REF"
  build_ref "$BASELINE_REF" "$BASELINE_SHA" "$BASELINE_DIR"

  log "Running baseline scenario"
  run_scenario "baseline" "$BASELINE_REF" "$BASELINE_SHA" "$BASELINE_DIR"

  log "Building candidate ref $CANDIDATE_REF"
  build_ref "$CANDIDATE_REF" "$CANDIDATE_SHA" "$CANDIDATE_DIR"

  log "Running candidate scenario"
  run_scenario "candidate" "$CANDIDATE_REF" "$CANDIDATE_SHA" "$CANDIDATE_DIR"

  log "Computing verdict"
  compute_verdict

  write_summary
  write_result_json

  log "Artifacts written to $ARTIFACT_ROOT"
  log "Final verdict=$VERDICT"
  exit "$RETURN_CODE"
}

main "$@"
