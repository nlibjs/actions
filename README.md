# nlibjs actions

Shared GitHub Actions for public npm package releases. Repositories in nlibjs and personal accounts can call the reusable workflow at a pinned commit SHA.

The workflow manages Node 26.x, npm 11.21.0, and cleanup-package-json 0.5.0. It separates npm staging from GitHub Release publication. JSR publication remains a separate job in the caller.

## Usage

Call the workflow from the consumer repository's `.github/workflows/release.yml`. Pin it to a reviewed full commit SHA from this repository.

```yaml
jobs:
  Stage:
    permissions:
      contents: write
      id-token: write
    uses: nlibjs/actions/.github/workflows/npm-release.yml@REPLACE_WITH_REVIEWED_SHA
    with:
      action: stage
```

[Examples](examples/README.md) cover the five nlibjs repositories and a personal repository. Replace their workflow SHA placeholders with a reviewed, merged version. The JSR examples require a `release:jsr` script in the caller; this repository does not add that script automatically.

## Inputs and outputs

| Input | Default | Description |
|---|---|---|
| action | verify | verify / stage / finalize |
| version | Empty | Required only for finalize; a stable semver without a v prefix |
| environment | Empty | An environment such as deployment; applies its protection rules |
| cleanup-source | registry | registry / local; local uses cleanup-package-json's own built CLI |

Outputs are package-name, version, tag, source-sha, npm-state, github-state, jsr-ready, and release-url. A successful finalize returns jsr-ready=true even when the GitHub Release is already published, allowing JSR to be retried.

action, version, and cleanup-source are validated before execution. Inputs are not interpolated directly into shell code. stage and finalize accept only a main push or a workflow_dispatch on main. verify also supports pull requests.

## Requirements

- package.json describes a public npm package with a stable version, and its repository matches the caller's GitHub repository.
- A lockfile and lint/test/build npm scripts exist. If additional preparation is needed, provide `release:prepare` and include the build in that script.
- CHANGELOG.md has a nonempty section for the version, headed by `## v1.2.3 (date)`.
- Private packages, authentication for private dependencies, monorepos, prereleases, other registries, and custom dist-tags are outside the initial scope.
- The caller's Actions settings permit this public reusable workflow.

Repositories using Biome pin it in devDependencies and the lockfile. ESLint/Prettier repositories also work through the `npm run lint` contract. Using Node 26.x for releases does not change the minimum Node version supported by consumers or the compatibility CI matrix.

## Release procedure

1. A package.json change on main or a manual stage starts release verification. Checkout includes the full history.
2. Retain the source SHA in `release-source/v<version>` before lint/test/build. Perform mandatory cleanup, create one tarball, and save the tarball and integrity on a draft Release. Confirm the source branch before sending that tarball to npm.
3. Treat exit code 0 from `npm stage publish` as success. A stage ID is optional diagnostic information; failure to extract it does not fail staging.
4. A maintainer approves the version with 2FA in npmjs.com's Staged Packages page.
5. Run the caller's Release workflow on main with action=finalize and version set to the approved version.
6. Verify npm dist.integrity against the saved tarball, publish the draft, and check the version tag against the fixed SHA. Delete the matching source branch, then run JSR if configured.

Release runners need Git for conditional source-branch cleanup. An Actions run does not wait across the approval period. finalize uses the draft's fixed SHA and tarball rather than rebuilding the latest main. The draft body and step summary include the approval and finalize instructions.

The `release-source/v<version>` namespace is reserved for temporary release refs. An existing ref is reused only at the exact source SHA; conflicts stop staging. Stage failures retain the ref for recovery. Finalize uses a Git lease to delete only the saved SHA, so a concurrently moved branch is retained. Cleanup failures can be retried through Finalize after publication. Older releases with no source branch remain supported.

## Existing versions and failures

| State | Behavior |
|---|---|
| npm version is public and its version tag exists | stage succeeds as a no-op; dependency-only updates do not fail |
| A draft exists with a successful staging receipt or a matching published npm version | Succeed without re-staging; direct the maintainer to approval or finalize |
| A draft exists without a successful receipt and npm is not public | Fail with an unknown outcome; retain the draft and never re-stage automatically |
| No draft exists, and only npm or the tag exists | Stop with an inconsistency |
| Drafts or assets are duplicated or incomplete | Stop and identify the candidates or missing assets |
| Staging exits nonzero and its outcome is unknown | Retain the draft; do not resend until a maintainer checks npm |
| Staging exits 0 but updating the body fails | Record npm success in the summary; do not resend while the draft exists |
| GitHub or JSR fails | Re-run finalize for the same version when npm and the saved integrity match |
| A pending run is replaced and stage never runs | Confirm the target version is on main, then run stage manually |

finalize also inspects published Releases, but does not automatically modify historical Releases without the new assets. Resolve existing tags to their commit SHA. Let GitHub create a missing tag when publishing the draft, then verify its SHA afterward.

After a failed stage, inspect npm Staged Packages and the public registry for the exact package/version. If a pending version exists, approve it and run finalize; if a public version exists, run finalize to verify it against the saved tarball. An unconfirmed draft keeps subsequent stage runs failing until the published version can be verified. This also applies if staging succeeded but saving its receipt failed.

Only after a maintainer confirms that neither a pending nor a public version exists may they reset a definitively failed attempt (for example, a rejected Trusted Publisher configuration). Record the error and source SHA, save any draft assets for diagnosis, fix the cause, then manually delete that draft and its matching temporary source branch before running stage again. A failed build can leave a source branch without a draft. The new attempt rebuilds current main; verify its version and changes against the recorded SHA. If npm's state is uncertain, retain the draft and source branch for investigation.

Find drafts by paging through the authenticated release list. Stop if multiple Releases share the tag; do not choose the newest automatically. Release state consists of tag_name/target_commitish, package.tgz, package.integrity, and the temporary source branch. There is no custom record schema or stage-ID-dependent automatic recovery.

A Release operation returning 403/404 is not proof of absence. When the saved commit's workflow files differ from the default branch and no branch or tag points directly to that SHA, [GitHub requires workflow modification permission](https://github.blog/changelog/2023-11-02-github-actions-enforcing-workflow-scope-when-creating-a-release/). Automatic source retention keeps a ref throughout npm approval. An already-outdated queued Stage run can still encounter a permission failure while creating its ref. For older drafts or creation failures, a maintainer can verify the saved SHA and assets, retain that SHA with a temporary source branch, and retry the failed operation. See the [changelog pilot recovery](docs/tasks/t005-changelog-pilot/verification.md).

## Authentication and permissions

Register the **caller repository's owner/repository, release.yml, and environment** as the npm Trusted Publisher. Do not register this shared repository as the publishing source. The Stage caller grants id-token: write, which the selected shared stage job inherits.

Set permissions on each caller job explicitly: verify uses contents: read; stage uses contents: write and id-token: write; finalize uses contents: write. The shared ValidateInputs and Verify jobs explicitly reduce permissions to contents: read. Publishing jobs inherit the caller job's permissions, so they request no higher permission ceiling during workflow validation. GitHub checks skipped jobs too: declaring fixed write permissions on a stage/finalize job would reject a read-only verify caller before any job starts. Each environment-protected operation uses one job, so adding required reviewers results in one approval per stage or finalize operation. An empty environment selects jobs without an environment.

No npm token or secrets: inherit is required. Keep secrets in the caller and pass individual secrets explicitly when another purpose requires them. Runners and GITHUB_TOKEN belong to the caller. Caller source code and secrets are not stored in this public shared repository.

## Development and validation

Use Node 26.x and npm 11.21.0.

```sh
npm ci --ignore-scripts
npm ci --prefix actions/npm-release --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run check
```

The helper, tests, and workflow checks use `.ts` ES modules with explicit import extensions. Node 26 executes them directly using built-in type stripping; no generated JavaScript, bundler, or runtime loader is needed. Type stripping does not check types: run `npm run typecheck` separately. The pinned TypeScript and Node type dependencies are development-only, and validation CI runs `tsc --noEmit` with strict checking, unchecked-index checking, and `erasableSyntaxOnly`. Use only erasable syntax (no enums or parameter properties).

Tests include a dry-run against a local fixture registry that rejects writes. They do not publish to the real registry. CI runs the same fixtures and checks workflow contracts, permissions, and pinned action SHAs.

Validate real OIDC authentication and provenance signing during the pilot repository's normal release. [R2 verification results](docs/tasks/t001-shared-workflows/verification.md) describe the verified scope.

## Updating the shared implementation

Pin the helper action to a full commit SHA inside the workflow. Update it in two steps:

1. Commit the helper action change as commit A.
2. Create commit B that pins the workflow's helper reference to A, and validate the combination.
3. Open caller PRs updating their shared workflow reference to B.

Merge this implementation PR and subsequent helper updates using **Create a merge commit**. Do not squash or rebase: the workflow pins the original helper commit A, which must remain in main's history. Before updating callers, verify that A is an ancestor of main and that the chosen workflow commit pins A. If repository policy requires squash or rebase, first merge the helper change, then create a separate workflow update pinned to the resulting main commit and review it before caller adoption.

If needed, revert a caller's reference to an earlier SHA. Do not roll back published versions; recover only the failed publishing destination.

## Design and rollout

See the [approved design](docs/tasks/t001-shared-workflows/design.md), [implementation and review plan](docs/tasks/t001-shared-workflows/plan.md), and [task record](docs/tasks/t001-shared-workflows/record.md). Codex implements and validates, Claude performs technical review, and the user makes final approval and merge decisions and approves npm with 2FA. Evaluate scheduled finalize and additional records after the pilot release.

Documentation, commits, pull requests, and review comments written for nlibjs use English.
