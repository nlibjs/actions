# Shared workflow implementation and review plan

Status: Revised R1 approved. The public nlibjs/actions repository exists, and the R2 draft PR is ready for review.

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

R1 is complete. R2 review precedes caller adoption and actual staging/publication through R3.

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
