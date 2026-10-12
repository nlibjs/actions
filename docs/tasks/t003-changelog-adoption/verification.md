# R3 changelog pilot adoption

Adoption PR: [nlibjs/changelog #554](https://github.com/nlibjs/changelog/pull/554). Candidate commit: `fa7ce4bb829dd4f83b7d958a7d5feec23a376166`. Changelog base: `0b2b586369483cab60c5096d72dcc6dedc6012eb`.

Shared workflow: `bdf4f40eafc6fd4732bb30f46fe4d611d44cb198`. Helper: `ca360dbda6c47172efe9f06fee633b7e5f524609`. Both are ancestors of shared main after PR #3's merge commit `98dd19df1a1137e6de377fff036605e1f089b2e9`. The workflow commit pins the helper in all five operation jobs.

## Caller behavior

- Replace the inline release implementation with pinned Verify, Stage, and Finalize callers.
- Preserve main/package.json automatic stage and the `release` concurrency group. Explicitly retain `cancel-in-progress: false`.
- Manual dispatch defaults to verify; finalize receives the approved stable version.
- Verify has contents read; Stage has contents write and id-token write; Finalize has contents write. No environment or inherited secrets are used.
- The caller uses registry cleanup and npm only. It has no JSR step.
- Package version, manifest, lockfile, source, and existing Lint/Test compatibility matrix are unchanged. The adoption merge alone does not match the package.json trigger.
- Add the caller's maintainer release guide with configuration values and saved-draft recovery instructions.

## Local validation (2026-10-12)

Node 26.11.1, npm 11.21.0, the committed changelog lockfile, shared cleanup-package-json 0.5.0, and actionlint 1.7.12 were used.

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed |
| npm run lint | Passed, using locked Biome 2.5.15 |
| npm test | All 74 tests passed |
| npm run build | Passed |
| Production shared helper verify | Passed lint/test/build/cleanup/pack and consumer-field validation |
| Release-state/publication guards | No release-state or publication adapter method called during verify |
| Caller/shared YAML contracts | Passed pins, inputs, permissions, operation conditions, concurrency, and unchanged manifests/compatibility workflow |
| actionlint -shellcheck= .github/workflows/release.yml | Passed |
| git diff --check | Passed |
| Cleaned tarball installed into a temporary consumer | CLI help and changelog generation for v0.4.0 passed |

The shared verify runner called the production `runRelease`/`createRuntime` from the merged source. It replaced release-state and publication methods with throwing guards, captured the packed tarball and outputs, and restored the tracked manifest after verification. Outputs were npm-state=unknown, github-state=absent, and jsr-ready=false. No staging command, registry publication, GitHub release write, or workflow dispatch was performed.

## Cleanup comparison

The comparison used the same adoption working tree before and after cleanup. It rebuilt before packing, compared every extracted tarball member, and checked every preserved manifest field. The adoption's README addition is intentional; no package implementation changed.

| Item | Before cleanup | After cleanup |
| --- | --- | --- |
| Package version | 0.4.0 | 0.4.0 |
| Tarball file count | 39 | 39 |
| Compressed bytes | 13,546 | 13,452 |
| Unpacked bytes | 41,740 | 41,595 |
| devDependencies and renovate | Present | Removed |
| Other 38 files | Byte-identical | Byte-identical |

Only `package/package.json` changed. Dependencies, engines, main, bin, scripts, files, type, publishConfig, repository, license, author, and every other retained field are unchanged. Source maps and test files remain excluded. The CLI bin exists, and installation from the cleaned tarball passed CLI help and changelog generation.

Cleaned tarball integrity from this verification: `sha512-a/38rz9JFxPm3YqLKXlFs9bZheMpe//1f39WqtWXb0GazOkBU6/WWXcbKmig8UdNoOq6L4rxqnr/afMqSAHP/g==`. This is a local candidate artifact, not a published npm version or a saved release draft.

Pre-existing package detail: `main: ./lib/index.js` refers to a file absent from both comparison tarballs. R3 preserves that field; the package's CLI entry is present and its installed CLI behavior passed. Consider the main entry in separate package review rather than assuming this migration validates a library entry point.

## Remaining R3 and pilot work

The adoption PR is a draft awaiting technical review and the user's merge decision. Its [compatibility CI run](https://github.com/nlibjs/changelog/actions/runs/38208801858) provides the existing platform/Node checks.

The user must confirm npm Trusted Publisher values for `@nlib/changelog`: owner `nlibjs`, repository `changelog`, workflow `release.yml`, environment empty. Confirm caller Actions settings permit the shared workflow. No external settings have been changed or independently verified.

Read-only npm metadata on 2026-10-12 confirms 0.4.0 is public, and its Git version tag exists. The next normal version is the pilot target. After adoption review/merge, validate real OIDC/provenance, saved draft assets and fixed SHA, maintainer npm approval, public integrity, GitHub finalization, and the final tag SHA. The user starts the first finalize. Keep remaining callers behind the R4 pilot-results review and approval checkpoint.

## Post-merge verify startup failure

Adoption PR #554 and plan PR #4 are merged. [Main verify run 38209633075](https://github.com/nlibjs/changelog/actions/runs/38209633075) concluded `startup_failure` with no jobs. GitHub's annotation reports that skipped Stage and ProtectedStage jobs requested contents write and id-token write above the Verify caller's contents-read-only ceiling. The original local checks covered helper execution and each workflow in isolation, but did not validate this nested permission combination.

Correct the shared workflow to inherit caller permissions for publishing jobs, retain explicit read-only ValidateInputs/Verify, and update the caller's fixed workflow SHA. Include whole-graph caller permission regression checks and disabled narrow reusable calls in validation CI. Main verify must pass after both reviewed changes are merged; real OIDC/provenance remains for the normal pilot release.
