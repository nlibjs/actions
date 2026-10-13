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

Keep jsr.json in sync with package.json; put generated-source checks in the caller's `release:prepare` script, which Stage runs before JSR publishes.
