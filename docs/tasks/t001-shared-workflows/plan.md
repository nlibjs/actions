# Shared workflow rollout plan

Snapshot: 2026-10-13. The Release-triggered implementation and changelog 0.4.2 pilot are verified. Lint-commit is migrated; cleanup-package-json is in review.

## Remaining work

| Phase | Change | Validation |
|---|---|---|
| cleanup-package-json | [Migration PR #563](https://github.com/nlibjs/cleanup-package-json/pull/563) | Local cleanup, deployment environment, and existing compatibility CI |
| typing | Parallel npm Stage and existing JSR CLI | Metadata, same-source publishing, existing-content checks, and independent retries |
| negotiate | Parallel npm Stage and Deno publishing | Deno checks, generated files, existing-content checks, and independent retries |
| Personal repository | Select and adapt a gjbkz caller | Owner-independent reuse and repository-specific configuration |
| Compatibility CI | Separate lint/runtime changes | Retained coverage and required checks |

Each caller migration uses a reviewed full workflow SHA and completes or recovers pending releases under its previous implementation. Package contents and consumer fields are compared during adoption.

Implementation and technical review precede maintainer merge and publication. Registry publishing is verified through normal releases; development uses fixtures and read-only hosted checks.

## JSR adoption checks

- Both destinations use the Release tag's resolved commit.
- Package and jsr.json identity, versions, and exports agree.
- Existing JSR content is verified; absence alone permits publishing.
- Communication errors and content conflicts stop publishing.
- npm failure does not block JSR, and JSR-only recovery does not resend npm.

Completed work and verification links are in the [record](record.md). Common settings, operations, and recovery are in the [README](../../../README.md).
