# Release workflow caller examples

Place each caller in its repository's `.github/workflows/release.yml`. Replace `REPLACE_WITH_COMMON_WORKFLOW_SHA` with a reviewed, merged full commit SHA. These examples are not installed automatically.

| Example | Repository-specific settings |
|---|---|
| changelog.release.yml | npm only |
| lint-commit.release.yml | environment: deployment |
| cleanup-package-json.release.yml | deployment and cleanup-source: local |
| typing.release.yml | JSR after finalize |
| negotiate.release.yml | JSR through Deno after finalize |
| gjbkz-package.release.yml | No fixed owner; validate compatibility with the selected repository |

Manual operations are verify (inspection without publishing), stage (the version in main's package.json), and finalize (the specified version). finalize accepts only a stable semver without a v prefix. Prereleases, other registries, and monorepos are outside the initial scope.

After npm approval, select main, action=finalize, and the approved version. Use the same operation to recover a GitHub/JSR failure. If a pending run was replaced before staging, confirm the target version is on main and run stage manually.

A version already public on npm with a matching version tag is a successful stage no-op. A draft prevents resending and directs the maintainer to approval/finalize. One-sided states or communication failures are not interpreted as unpublished versions.

## JSR preparation

The typing/negotiate examples require a `release:jsr` script in the caller. It checks metadata and the content/source of an existing version, and builds, dry-runs, and publishes only when the version is absent. Preserve typing's existing npx jsr flow and negotiate's check:release, build:index, generated-file diff, and Deno publish flow. Pin the CLI version during adoption.

Check out the source-sha returned by the shared workflow. finalize returns jsr-ready=true even for an already published GitHub Release, so JSR can be retried independently. Add release:jsr in the individual adoption PRs after R4; this PR does not add caller scripts.

## npm configuration

Register the caller's owner/repository/release.yml/environment as its Trusted Publisher. The personal repository owner is gjbkz. Do not register nlibjs/actions as the publishing source. No npm token or secrets: inherit is required.

## Updating references

Create helper action commit A, then workflow reference commit B. Validate B before proposing it to callers. The root README describes this procedure.
