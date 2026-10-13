# Release workflow caller examples

Copy [npm.release.yml](npm.release.yml) for npm-only packages or [jsr.release.yml](jsr.release.yml) for npm and JSR. Replace REPLACE_WITH_COMMON_WORKFLOW_SHA with a reviewed workflow commit.

Uncomment the optional environment, local cleanup, or Deno lines for these callers:

| Caller | Template | Settings |
|---|---|---|
| changelog, selected gjbkz npm repository | npm | Defaults |
| lint-commit | npm | Stage environment: deployment |
| cleanup-package-json | npm | Stage environment: deployment; cleanup-source: local in both Verify and Stage |
| typing | jsr | Defaults |
| negotiate | jsr | Deno setup |

Follow the shared [requirements](../README.md#requirements), [release procedure](../README.md#release-procedure), and [recovery instructions](../README.md#existing-versions-and-failures). Keep package-specific settings in workflow comments.

## JSR preparation

Keep package.json and jsr.json versions in sync. Stage runs the caller's build or release:prepare script; validate generated source there before JSR publishes the committed source from a fresh checkout. Preserve the caller's JSR/Deno checks.

The JSR template uses the pinned official CLI after Stage succeeds. See the shared [release procedure](../README.md#release-procedure) for execution order and npm approval.
