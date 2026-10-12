# Shared release workflow design

Status: revised design; implementation and caller migration are pending. The deployed workflow still uses Stage and Finalize. Historical validation remains in record.md and the linked task records.

## Release lifecycle

1. A maintainer publishes a stable GitHub Release with a version tag.
2. The caller's `release: published` event starts npm staging and, where configured, JSR publishing as independent jobs.
3. A maintainer approves the staged npm version with 2FA on npmjs.com.

GitHub Release is public before registry distribution completes. JSR may become available before npm approval. Each destination reports its own outcome; failure in one destination does not block the other. There is no manual Finalize operation in this lifecycle.

## Source and validation

Resolve the Release tag to a full commit SHA, including annotated tags. Require the tag, package.json version, stable Release status, and repository identity to agree. JSR callers also validate jsr.json name/version and export paths. Each publishing job checks out the same resolved commit; it never builds current main as a substitute.

Require lint, tests, build, and tarball inspection for npm. Use Node 26.x, pinned npm, and mandatory cleanup-package-json. Its own package uses its built local CLI. Preserve consumer fields, supported Node versions, and compatibility CI coverage.

JSR jobs use the original manifest and repository-specific preparation. Preserve typing's existing JSR CLI flow and negotiate's Deno checks, generated-file checks, and publishing flow. npm staging success is not a prerequisite for JSR.

A release created with GITHUB_TOKEN does not normally trigger another workflow. The release procedure must use a triggering actor/token or explicitly invoke the deployment workflow. Verify this path before rollout.

## Caller interface

Callers own Release events, concurrency, deployment environments, and JSR jobs. Pin shared workflows and helper actions to reviewed full SHAs.

The revised npm interface supports read-only Verify and Stage. Verify remains the default manual check. A manual Stage retry identifies an existing published Release by tag and validates its source; it does not publish from an arbitrary branch. Replace Finalize-specific inputs and outputs, including jsr-ready, in the shared workflow and callers together.

Publishing accepts stable, non-draft, non-prerelease Releases belonging to the caller repository. Draft creation, package.json pushes, Release edits, pull requests, and forks do not initiate distribution.

Serialize deployment attempts for the same Release while allowing npm and JSR jobs within an attempt to run in parallel. Different versions must not replace each other's pending runs. Preserve independent failed-job retries.

## Persistence and recovery

Create and inspect one npm tarball, save it and its integrity before submission, and stage those exact bytes with provenance. Bind saved state to the Release ID, tag, resolved SHA, and package identity. Persist the successful staging receipt; a stage ID is optional.

Published immutable Releases cannot accept new assets. Choose and validate storage for tarballs and receipts, including retention and recovery after artifact expiry, before implementation approval. Missing saved evidence stops automatic retries. An immutable Release must remain supported without editing its body or assets.

| Destination state | Recovery |
|---|---|
| npm stage succeeded; approval pending | Approve in npmjs.com; do not submit again |
| npm is public | Compare published integrity with the saved tarball; matching content succeeds |
| npm submission outcome is unknown | Inspect pending/public state; do not automatically resend |
| JSR version exists | Verify source content and exports; matching content succeeds |
| JSR version is absent | Publish the validated source with the existing CLI |
| Lookup fails, content conflicts, or the tag moves | Stop the affected destination and report the mismatch |

Tag existence identifies the source, not completion of registry publishing. Treat only a definitive missing-version response as absence. Retrying JSR must not resend npm. No deployment step creates or publishes a GitHub Release, creates a version tag, or maintains temporary source branches.

npm approval completes npm publication. Public-integrity confirmation is a read-only check, not a required manual lifecycle operation. Any automated post-approval monitor needs a separate scheduling decision.

## Permissions and repository settings

Verify uses contents: read. Publishing needs id-token: write and the minimum GitHub permission required by the chosen persistence mechanism. Validate narrow permissions through GitHub's nested workflow checks, including skipped jobs.

Configure npm Trusted Publisher for the caller owner/repository/release.yml/environment. Retain deployment environments and their protection rules; each npm staging attempt uses one protected job. Verify needs no deployment approval.

| Repository | npm environment | Cleanup | JSR |
|---|---|---|---|
| changelog | None | registry | None |
| lint-commit | deployment | registry | None |
| cleanup-package-json | deployment | local | None |
| typing | None | registry | Existing JSR CLI |
| negotiate | None | registry | Existing Deno CLI/checks |
| Selected gjbkz repository | Caller setting | registry | When needed |

Common operations and recovery belong in the shared README. Keep caller-specific settings in release.yml comments.

## Migration

Complete or explicitly recover existing staged versions and drafts under the deployed workflow before switching each caller. Retain the old full-SHA implementation for those attempts. Remove automatic package.json-triggered staging when enabling Release-triggered deployment, so both lifecycles cannot submit the same version.

Update the shared implementation and examples first, then migrate changelog as the pilot. After verification, migrate lint-commit and cleanup-package-json individually, followed by typing and negotiate. Personal-repository adoption and compatibility CI work remain later phases.
