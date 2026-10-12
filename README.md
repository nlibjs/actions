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
2. Run lint/test/build, perform mandatory cleanup, and create one tarball. Save the tarball and its integrity on a draft Release before sending it to npm.
3. Treat exit code 0 from `npm stage publish` as success. A stage ID is optional diagnostic information; failure to extract it does not fail staging.
4. A maintainer approves the version with 2FA in npmjs.com's Staged Packages page.
5. Run the caller's Release workflow on main with action=finalize and version set to the approved version.
6. Verify npm dist.integrity against the saved tarball, check the tag against the fixed SHA, and publish the draft. Run JSR afterward.

An Actions run does not wait across the approval period. finalize uses the draft's fixed SHA and tarball rather than rebuilding the latest main. The draft body and step summary include the approval and finalize instructions.

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

Only after a maintainer confirms that neither a pending nor a public version exists may they reset a definitively failed attempt (for example, a rejected Trusted Publisher configuration). Record the error and the draft's target SHA, save its assets for diagnosis, fix the cause, then manually delete that draft and run stage again. The new attempt rebuilds the current main; verify its version and changes against the recorded SHA before proceeding. If npm's state is uncertain, retain the draft and investigate instead of resetting. There is no automatic deletion or retry.

Find drafts by paging through the authenticated release list. Stop if multiple Releases share the tag; do not choose the newest automatically. Persist only Release tag_name/target_commitish, package.tgz, and package.integrity. There is no custom record schema or stage-ID-dependent automatic recovery.

Do not treat a Release operation returning 403/404 as proof of absence. GitHub may require additional workflow modification permissions when the saved target's workflow files differ from the default branch. Do not add a long-lived token automatically; review the configuration and procedure instead.

## Authentication and permissions

Register the **caller repository's owner/repository, release.yml, and environment** as the npm Trusted Publisher. Do not register this shared repository as the publishing source. Both caller and callee need id-token: write for staging.

verify uses contents: read. stage uses contents: write and id-token: write in one job. finalize uses contents: write. Each environment-protected operation uses one job, so adding required reviewers results in one approval per stage or finalize operation. An empty environment selects jobs without an environment.

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
