# Release workflow caller examples

Copy [npm.release.yml](npm.release.yml) for npm-only packages or [jsr.release.yml](jsr.release.yml) for npm and JSR. Replace REPLACE_WITH_COMMON_WORKFLOW_SHA with a reviewed workflow commit; the JSR example also needs REPLACE_WITH_HELPER_SHA set to its helper pin.

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

The JSR template requires a caller release:jsr script. It validates package/jsr metadata and the live tag against RELEASE_SOURCE_SHA. Existing versions require matching source content and exports; only definitive absence permits publishing.

Both destinations use the Source job's resolved SHA. JSR uses the original manifest and can recover independently from npm. Preserve the caller's JSR/Deno checks and generated-file validation; pin its tooling during adoption.
