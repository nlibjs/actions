# Shared workflow implementation and review plan

Status (2026-10-12): R1 and R2 are complete. Shared implementation PR #1 and strict TypeScript follow-up PR #3 are merged. R3 changelog adoption PR #554 and plan PR #4 are merged. The first main verify attempt failed during startup because skipped shared publishing jobs requested permissions above the read-only caller's ceiling. Fix shared permission inheritance and update the caller pin, then rerun verify before the normal pilot release.

Centralize release processing, pilot it in changelog, then roll out to the other four repositories and a selected gjbkz repository. Codex implements, validates, and revises; Claude performs technical review; the user makes final decisions and merges. The user shares materials with Claude. Each checkpoint includes a design or PR, changes, verification evidence, and unresolved items. Proceed only within the reviewed scope and do not merge all callers at once.

## Responsibilities and checkpoints

| Phase | Codex | User | Condition to proceed |
|---|---|---|---|
| R1 design review | Prepare design/caller examples and address findings | Decide publishing order and interface after technical review | Design agreed |
| Create shared repository | Move plan/design/record after creation | Create public nlibjs/actions | Write access and Actions settings available |
| R2 shared implementation PR | Workflow, helper, README, and fixture validation | Review and decide whether to merge | State/recovery/permission checks pass |
| R3 changelog adoption PR | Pinned caller, cleanup, and package content comparison | Review/merge and confirm npm authentication settings | Nonpublishing checks and contents agreed |
| Pilot normal release | Assist with approved stage, results, and fixes | Confirm release, approve npm with 2FA, and start finalize | npm/GitHub/persisted package consistency confirmed |
| R4 pilot results review | Present results and recovery procedure | Review results | Rollout to remaining callers approved |
| Remaining caller PRs | lint-commit/cleanup first, then typing/negotiate separately | Review/merge each PR and configure environment/authentication as needed | Compare contents and verify each repository's differences |
| R5 personal repository PR | Adapt and verify the selected repository | Select repository, configure it, and review | Owner-independent reuse confirmed |
| R6 CI PRs | Separate Lint/Node CI changes | Review and update required checks if needed | Existing coverage and required checks retained |

Repository creation is assigned to the user; the GitHub connector has no repository creation tool. Preparation can proceed beforehand. An initial README is optional; use main as the default branch. Public visibility supports public nlibjs callers and gjbkz reuse.

Provide concrete values and instructions immediately before user configuration tasks. Do not request secret values in chat; register them directly in the caller. The user owns npm/2FA/environment configuration while Codex assists.

## R1 completion

- Agree on the publishing order, inputs/outputs, recovery, and environment handling in [design.md](design.md).
- Keep GitHub draft while npm awaits approval; publish JSR after finalize.
- Start finalize manually after approval.
- Cover caller behavior in the [examples](../../../examples/README.md).

R1 and R2 are complete. PR #1 merged as `e463599b9a24190644b5d32475d818d04acd57dd`, and PR #3 merged as `98dd19df1a1137e6de377fff036605e1f089b2e9`. The reviewed workflow commit `bdf4f40eafc6fd4732bb30f46fe4d611d44cb198` and its helper pin `ca360dbda6c47172efe9f06fee633b7e5f524609` are both ancestors of main. R3 proposes this workflow commit to changelog.

## R2 validation

Exercise the workflow interface with fixtures for new versions, pending states, successful legacy no-ops, exit 0 without an ID, unknown outcomes, tag mismatches, draft/asset persistence failures, duplicate drafts, and finalize retries. Check both cleanup implementations, fixed CLI output, tarball input, and provenance options.

Do not equate tag existence with complete publication or communication failure with absence. Save draft/tarball/integrity before sending to npm, and prevent automatic same-version resending after a partial failure.

## Adoption configuration

- The shared repository is public and caller Actions settings permit pinned references.
- npm Trusted Publisher matches caller owner/repository/release.yml/environment.
- Both deployment environments currently have no protection rules; recheck at adoption and retain one approval per protected stage/finalize if rules are added.
- Manage each lint tool through a lockfile. Do not add latest Biome in CI; remove changelog's extra install in R6 or a separate PR.
- Retain required check names and compatibility test coverage.

Publish only during normal releases, not as registry test releases. After R3, validate pilot OIDC/staging before expanding to the remaining repositories.

## Updates and recovery

Update callers through pinned SHA PRs. Revert references when necessary; recover failed destinations rather than rolling back published versions.

Update record.md as work progresses, including reviews, settings, and evidence. Finalize README/records after R6. All repository files, PRs, and comments written for nlibjs use English.

## Initial scope and later extensions

R2 persists only Release tag_name/target_commitish, tarball, and integrity. Do not implement custom record schemas, complete run-history verification, stage-ID-dependent restoration, or scheduled finalize. Evaluate specific needs at R4 and propose separate PRs.

Commit helper changes as A, then update the workflow's pinned helper reference in B. Validate B and propose B to callers. Document this two-step update in README.

## Current next steps: R3 and pilot

1. Review [changelog PR #554](https://github.com/nlibjs/changelog/pull/554) and its [nonpublishing verification](../t003-changelog-adoption/verification.md). The caller adds verify/stage/finalize and mandatory cleanup; its package version, lockfile, runtime compatibility, and existing Lint/Test jobs are unchanged. Local verification passed all 74 tests, cleanup/content checks, and an installed-tarball CLI check. The cleanup comparison changes only devDependencies and renovate in package.json; all other 38 tarball files are byte-identical.
2. Before the first shared release, the user confirms npm Trusted Publisher values for `@nlib/changelog`: GitHub owner `nlibjs`, repository `changelog`, workflow filename `release.yml`, environment empty. Confirm that caller Actions settings allow the shared workflow. These external settings have not been changed or independently verified.
3. After technical review and the user's merge decision, use manual verify to inspect the adopted workflow if needed. The adoption PR does not change package.json and therefore does not itself start staging. npm 0.4.0 is already public and has a Git tag; use the next normal version for the pilot, not a test publication or a historical finalize without saved assets.
4. During that normal release, confirm the draft's fixed SHA, saved tarball/integrity, successful staging exit, and real OIDC/provenance behavior. The user approves the exact npm version with 2FA and starts finalize on main. Verify public npm integrity, the published GitHub Release, and its tag SHA against the saved source.
5. Record the run URLs, version, SHA, approval/finalization results, and any recovery findings for R4 review. Expand to the remaining callers only after the user approves the pilot results.

The existing `main: ./lib/index.js` field refers to a file absent from both changelog comparison tarballs. Its CLI bin exists and works after installation. Record this pre-existing detail for separate package-entry review; R3 preserves consumer fields. Removing changelog's extra Biome install remains R6 or a separate small PR.
