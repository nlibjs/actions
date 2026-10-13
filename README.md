# Shared release workflows

Use this public repository to verify and stage npm packages from a published GitHub Release. Callers can publish to JSR in parallel. Release tooling uses Node 26.x, npm 11.21.0, and cleanup-package-json 0.5.0.

## Usage

Copy the appropriate [caller example](examples/README.md) into `.github/workflows/release.yml` and replace its SHA placeholders with reviewed commits. Publishing starts on `release: published`; package.json changes alone do not publish.

```yaml
Stage:
  permissions:
    contents: read
    actions: read
    id-token: write
  uses: nlibjs/actions/.github/workflows/npm-release.yml@REPLACE_WITH_COMMON_WORKFLOW_SHA
  with:
    action: stage
    tag: ${{ github.event.release.tag_name || inputs.tag }}
```

## Inputs and outputs

| Input | Default | Meaning |
|---|---|---|
| action | verify | verify or stage |
| tag | Empty | Published stable Release tag for stage, e.g. v1.2.3 |
| environment | Empty | Optional deployment environment for Stage |
| cleanup-source | registry | registry or local; local is restricted to cleanup-package-json self-release |

npm and JSR use github.sha and independently validate the live Release tag. JSR does not depend on npm Stage.

## Requirements

- A public npm package with a stable version, matching GitHub repository, and a lockfile.
- npm scripts lint, test, and build. Optional release:prepare replaces build and must include it.
- A nonempty CHANGELOG.md section headed by `## v1.2.3 (date)`.
- Caller Actions settings permitting pinned shared workflows and actions.
- npm Trusted Publisher configured for the caller owner/repository/release.yml/environment.
- Artifact retention configured to the maximum period permitted by repository policy. Uploads use that repository default; public repositories allow up to 90 days.

Release tooling does not change consumer Node support or compatibility CI. Private packages, private dependency authentication, prereleases, monorepos, custom dist-tags, and other registries require separate support.

## Release procedure

1. Prepare and merge the version and CHANGELOG update through the package's normal process.
2. On GitHub, create a stable Release with tag `v<package.json version>` at that commit. Copy the matching CHANGELOG section into the notes and publish it.
3. The workflow checks the published Release and tag, runs lint/tests/build, cleans the npm manifest, and inspects one tarball. Before submission it saves the expected integrity as a workflow artifact, then stages those exact bytes with provenance and saves the result.
4. Approve the exact package/version in npmjs.com → Staged Packages using maintainer 2FA.

JSR callers publish the same source independently while npm awaits approval. GitHub Release and JSR can therefore be available before npm. No Finalize operation follows approval.

A GITHUB_TOKEN-created Release normally does not trigger another workflow. Publish through the GitHub UI or a triggering actor/token; automation using GITHUB_TOKEN must explicitly invoke deployment. The source commit must contain the Release-triggered caller before its Release is published.

## Existing versions and failures

Evidence artifacts contain only package identity, Release ID, tag, commit, integrity, and staging result. They contain no tarball. Release bodies, assets, tags, and branches are never modified.

| State | Next step |
|---|---|
| npm stage succeeded; approval pending | Approve in npmjs.com; retries do not resend |
| npm is public | Stage retry verifies saved integrity and succeeds without rebuilding |
| Submission failed or its outcome is unknown | Inspect npm Staged Packages and public npm; retries stop without resending |
| Preparation failed before submission | Re-run Stage on the same Release tag |
| Evidence is missing after submission started, or expired | Inspect registry state; retries stop without resending |
| JSR failed | Re-run its failed job; it verifies existing content or publishes an absent version |
| Tag moved, evidence conflicts, or a lookup fails | Investigate the affected destination; no automatic repair |

For manual Stage, select the published Release tag in **Run workflow**, choose action=stage, and enter the same tag. The selected commit must match the Release source so npm provenance identifies the built commit. Manual dispatch can deploy a Release whose event did not trigger, including one created with GITHUB_TOKEN.

Stage automatically checks prior submission steps before retrying preparation. If submission may have started without a successful receipt, it stops and asks you to inspect npm Staged Packages. Keep workflow history and evidence during recovery; lookup failures stop publishing.

JSR uses the same source and runs independently. Re-run its failed job to recover only JSR. A manual Stage also checks JSR in configured callers; matching existing JSR content is a no-op.

## Authentication and permissions

Verify uses contents: read. Stage uses contents: read, actions: read for evidence retrieval, and id-token: write for npm Trusted Publishing. GitHub-hosted runners are required. No npm token or inherited secrets are needed for public publishing.

The shared Stage jobs inherit caller permissions; Verify explicitly reduces them. GitHub checks skipped nested jobs too, so publishing jobs must not request writes from a read-only Verify caller. A configured environment protects one Stage job; an empty setting creates no environment. Lint-commit and cleanup-package-json retain deployment to match their Trusted Publisher configuration.

Use a caller concurrency group containing the Release tag, with cancel-in-progress=false. npm and JSR run in parallel within that group. Deploy different versions in separate groups so pending releases cannot replace one another.

## Development and validation

```sh
npm ci --ignore-scripts
npm ci --prefix actions/npm-release --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run check
```

Use Node 26.x and npm 11.21.0. Tests use fixtures and a local dry-run registry; they do not publish packages. Workflow checks cover action pins, permissions, and caller sources. Run actionlint on the workflows and examples as well.

## Updating and migration

Commit helper changes first, then commit the workflow referencing that full helper SHA. Validate the workflow commit and update callers through separate reviewed PRs. Keep both commits in shared main history.

Before migration, complete or explicitly recover existing pending versions and drafts using their old pinned Stage/Finalize implementation. Replace package.json-triggered staging and Finalize callers together. Existing caller pins continue to use their original implementation.
