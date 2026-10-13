# Release workflow caller examples

Copy a caller to `.github/workflows/release.yml`. Replace REPLACE_WITH_COMMON_WORKFLOW_SHA with a reviewed workflow commit and, for JSR callers, REPLACE_WITH_HELPER_SHA with its helper pin.

| Example | Settings |
|---|---|
| changelog.release.yml | npm only |
| lint-commit.release.yml | environment: deployment |
| cleanup-package-json.release.yml | deployment and cleanup-source: local |
| typing.release.yml | JSR CLI in parallel with npm Stage |
| negotiate.release.yml | Deno checks/publishing in parallel with npm Stage |
| gjbkz-package.release.yml | Selected personal npm repository |

Follow the shared [requirements](../README.md#requirements), [release procedure](../README.md#release-procedure), and [recovery instructions](../README.md#existing-versions-and-failures). Package-specific settings belong in workflow comments.

## JSR preparation

JSR examples require a caller release:jsr script. It validates package/jsr metadata and the live tag against RELEASE_SOURCE_SHA. Existing versions require matching source content and exports; only definitive absence permits publishing.

Both destinations use the Source job's resolved SHA. JSR uses the original manifest and can recover independently from npm. Preserve typing's existing JSR CLI and negotiate's Deno checks and generated-file validation; pin their tooling in each adoption PR.
