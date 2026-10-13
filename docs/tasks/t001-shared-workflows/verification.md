# Initial implementation verification

Historical snapshot: 2026-10-12, before caller adoption. This verified the Stage/Finalize workflow. Current verification is in the [record](record.md).

## Caller verification

At each fixed SHA, npm ci, lint, tests, build, cleanup, and pack passed on Node 26.5.0 and npm 11.21.0.

| Repository | Fixed SHA | Verify |
|---|---|---|
| changelog | `0b2b586369483cab60c5096d72dcc6dedc6012eb` | Passed |
| lint-commit | `b8911187707ec7b7fee83ca1e3fb52002a48ad24` | Passed |
| cleanup-package-json | `13e2553fa61b35b44eb26bdbdc37ff8c47f43e07` | Passed |
| typing | `15c296e06c959e97cf997c625dbf3941f876f50d` | Passed |
| negotiate | `185ed8850f37f3f8183429ead55c5cb8fe6c3394` | Passed |

Cleanup-package-json used its built CLI; other callers used registry version 0.5.0. Tarball checks preserved dependencies, exports, types, bin, and other consumer fields while removing development metadata.

## Shared implementation

All 24 fixture/dry-run tests passed, followed by 25 tests after the unconfirmed-draft regression. Biome, actionlint 1.7.12, workflow contracts, and whitespace checks passed.

Coverage included existing-version no-ops, conflicting state, duplicate drafts, communication errors, optional stage IDs, unknown submissions, saved assets before staging, receipt failures, annotated tags, and Finalize integrity checks.

The npm 11.21.0 dry-run accepted the saved tarball and preserved its integrity. Its local registry rejected writes. These checks exercised fixtures rather than real OIDC signing or registry publication.

Real publication was subsequently verified in the [0.4.1 pilot](../t005-changelog-pilot/verification.md).
