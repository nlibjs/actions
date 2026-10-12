# R2 verification results

The shared implementation was verified without publishing. Cleanup ran only in working copies of caller repositories. No caller remote changes or npm/GitHub/JSR publications were performed.

## Release verification across five repositories

At each fixed SHA, use npm 11.21.0 to run npm ci, lint, test, build, cleanup, and pack, and check that consumer fields remain in the packaged package.json. Checkout includes the full history.

| Repository | Fixed SHA | Node | verify |
|---|---|---|---|
| changelog | `0b2b586369483cab60c5096d72dcc6dedc6012eb` | v26.5.0 | Passed |
| lint-commit | `b8911187707ec7b7fee83ca1e3fb52002a48ad24` | v26.5.0 | Passed |
| cleanup-package-json | `13e2553fa61b35b44eb26bdbdc37ff8c47f43e07` | v26.5.0 | Passed |
| typing | `15c296e06c959e97cf997c625dbf3941f876f50d` | v26.5.0 | Passed |
| negotiate | `185ed8850f37f3f8183429ead55c5cb8fe6c3394` | v26.5.0 | Passed |

cleanup-package-json uses its built local CLI. The other four use the pinned registry version 0.5.0. Compare dependencies, exports, type metadata, bin, sideEffects, and other consumer fields against the original package.json. Check removal of devDependencies/renovate and inspect package contents. These results do not replace the existing OS/Node/Bun/Deno CI matrices.

## Shared implementation verification

All 24 fixture/dry-run tests passed. Biome lint, actionlint, and workflow contract checks also ran successfully.

- Verify successful no-ops, inconsistent npm/tag states, duplicate drafts, communication/permission errors, exit 0 without a stage ID, and nonzero exits with unknown outcomes.
- Verify that npm is not called before saving the tarball/integrity, and that a receipt update failure after successful staging does not cause resending.
- Verify finalize integrity checks, full commit targets, annotated tags, already-published retries, and outputs enabling independent JSR retries.
- Use real cleanup and npm pack to verify preservation of consumer fields.
- Use npm 11.21.0 stage dry-run against a local registry that rejects writes. Confirm that it accepts the saved tarball, preserves integrity, and performs no registry writes.
- Validate workflow syntax and expressions with actionlint 1.7.12. Check YAML, permissions, inputs/outputs, caller contracts, and pinned action references.

## Checks remaining during adoption

Validate real OIDC authentication and provenance signing during changelog's normal release after R3. A dry-run does not establish signing or successful stage creation on the npm registry.

Validate token permissions for GitHub draft creation, asset upload, and publication, including restrictions when target workflow files differ from the default branch. Do not interpret failures as absence. Individual JSR adoption PRs add release:jsr and its own verification.

R2 does not include caller adoption, publication, or merging.
