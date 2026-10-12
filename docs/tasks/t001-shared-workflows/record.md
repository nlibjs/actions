# Shared workflow task record

## Request and agreement

Share release processing across five nlibjs repositories and support gjbkz personal callers. The user approved revised R1 and created public nlibjs/actions. R2 moves the design/plan and prepares a shared implementation PR. Merging, caller adoption, and publication remain behind the R2/R3 checkpoints.

## Plan

1. Inspect repository/runtime and fixed npm/cleanup/Actions behavior.
2. Implement verify/stage/finalize and the helper action.
3. Validate no-ops, exit status, drafts/assets, tags/package integrity, and permissions.
4. Verify all five repositories, prepare docs/examples, and present the R2 PR.

## Progress

- Initial main contained README and Apache 2.0 LICENSE. Created feat/shared-npm-release.
- Implement the four-input R1 interface, Node 26.x, mandatory cleanup, one stage job, optional stage ID, draft/tarball/integrity, and manual finalize.

## Decisions

- Exclude custom record schemas and automatic finalize from the initial implementation.
- Do not test publication against the real registry.

## Implementation and initial verification

- Confirmed that cleanup 0.5.0 and npm 11.21.0 are public. Inspected the fixed npm source: stage inherits publish and handles tarball input, JSON stageId, and provenance options.
- Implemented policy, release orchestration, GitHub/npm/filesystem adapters, a composite action, and a reusable workflow. Include exit-0 success, optional IDs, successful no-ops, assets saved before staging, and finalize integrity/tag checks.
- Resolved existing v7 SHAs for checkout/setup-node. Pin the helper after its implementation commit.
- The first 21 fixtures passed. The additional tarball dry-run required a permitted local listener because of sandbox restrictions.
- Initial Node 26.5.0/npm 11.21.0 verification completed for four repositories while lint-commit continued; it later completed successfully.
- Fixed npm acquisition initially failed because the elevated shell had a different PATH. Used absolute Node/npm paths. Moved verification cache into a temporary work directory to avoid home-directory write restrictions.

## Final verification and PR preparation

- All 24 fixtures/dry-runs passed, and all five repository verify runs succeeded on Node 26.5.0/npm 11.21.0. lint-commit passed 47 tests and packaging.
- The fixed CLI's JSON output is nested by package name. Adapted the dry-run assertion to the real output. The fixture registry received no writes.
- Pinned Biome 2.5.15 as this repository's devDependency. Lint/format checks and actionlint 1.7.12 passed.
- Helper commit A: 3fb64859ff81c0ee9699aafa75a74acf28d9a070. Pinned the workflow to A.
- Git signing initially failed because the sandbox could not reach gpg-agent. Retained configured signing and committed successfully in the permitted execution environment.
- Moved R1 design/plan into docs/tasks, added six examples and verification results, and retained the existing LICENSE.
- Real OIDC, provenance signing, and draft publication remain for a normal pilot release after R3. Fixture/dry-run success is not proof of successful real publication.

## R2 status

- Draft PR: https://github.com/nlibjs/actions/pull/1
- Branch: feat/shared-npm-release. Workflow/documentation commit B: d577ffcdcc47ba0d0fe3430c6dd566c3d2655423.
- GitHub Validate passed lint, 24 tests, and workflow contracts: https://github.com/nlibjs/actions/actions/runs/38199788600.
- Documentation head 7743407c4ff13bf1c2108dfc2ba9343337eac4f9 also passed both push and PR checks: runs 38199880438 and 38199883514.
- The initial PR attempt preceded branch upload completion and failed because the head ref was absent. Recreated it successfully after upload completed.
- R2 preparation is complete; await Claude technical review and the user's final decision. No main merge, caller adoption, or npm/GitHub/JSR publication has occurred.

## English language requirement

- The user requested English for all nlibjs organization writes.
- Translate repository README, design, plan, task record, verification results, examples guide, and the PR body into English. Preserve implementation behavior and approved constraints.
- Keep future repository documents, commit messages, PRs, and comments in English. Chat communication remains Japanese.
- Check all changed document links/code fences, scan tracked text for remaining Japanese, and confirm that only documentation changed.

## R2 review follow-up

- Review: https://github.com/nlibjs/actions/pull/1#pullrequestreview-5486308407.
- Plan: explicitly require merge commits to preserve helper SHAs; document manual recovery only after confirming no pending or published npm version; fail retries whose draft has no confirmed staging receipt and no published npm version. Never resend automatically.
- Evaluate TypeScript separately: Node 26 supports direct execution of erasable types; CI must separately run type checking. No migration requested or performed yet.
- Validation pending for the review changes.

- Implemented all three review items. Unknown draft retries now fail without sending npm requests; successful receipt and matching published version remain valid no-ops. Manual reset requires confirmed absence of both pending and public npm versions, with source changes explicitly checked.
- Helper review-fix commit: 97d752460d5f4ad26702c105d4e5d9b6870641df; workflow repinned in a subsequent commit. Merge-commit requirements and the two-PR alternative are documented.
- Validation: 25 tests passed, including the added unconfirmed-draft regression and npm 11.21.0 tarball dry-run. Biome, actionlint 1.7.12, workflow contracts, and diff whitespace checks passed. Repeat against the final helper pin before pushing.
- TypeScript recommendation: a separate reviewed change using direct Node 26 execution and strict noEmit type checking; retain runtime manifest/API validation.

- Final helper SHA after formatting: a5969bcedb41e1968f07a01a2c9e3e7c169bbbee. Biome formatting correction applied before the final workflow pin.

## TypeScript follow-up (Issue #2)

PR #1 merged with a merge commit on 2026-10-12, preserving the R2 helper pin. The separate [TypeScript migration](../t002-release-typescript/verification.md) builds on that main commit. It adds direct Node 26 execution, strict noEmit checking, typed runtime fixtures, and checked external JSON. Caller adoption and real publication remain separate rollout steps.
