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

Publish a stable GitHub Release at the intended commit, matching the package.json version and copying its CHANGELOG notes. npm is staged automatically; approve it in npmjs.com. See the [common release and recovery procedure](../README.md#release-procedure).

Manual dispatch defaults to verify. Select stage and a published Release tag to inspect/recover npm state; dispatch does not submit a new package. npm submissions require the initial published Release event. Prereleases are rejected explicitly because published events also include prereleases.

## JSR preparation

JSR examples require a caller release:jsr script. Validate package/jsr metadata and the live tag against RELEASE_SOURCE_SHA before publishing. If the version exists, compare its source content and exports; communication errors and conflicts must fail. Publish only when definitively absent.

Both destinations use the Source job's resolved SHA. Their jobs run independently; retry the failed JSR job without rerunning npm. Preserve typing's existing JSR CLI and negotiate's Deno checks and generated-file validation. Add scripts and pin their tooling in each adoption PR.

## Configuration

Register the caller owner/repository/release.yml/environment as npm Trusted Publisher. JSR keeps its own publishing authorization. npm Stage needs contents: read, actions: read, and id-token: write; source resolution and Verify need only contents: read. Configure artifact retention to the maximum permitted repository default.

Keep repository-specific settings in release.yml comments. Complete old pending releases with their old pinned workflow before replacing its triggers and Finalize jobs.
