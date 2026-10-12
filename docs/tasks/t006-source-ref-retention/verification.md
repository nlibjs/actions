# Automatic release source retention

## Purpose

The changelog pilot needed a temporary source branch after workflow changes on main caused GitHub to reject publishing its saved commit. Retain that ref during Stage so Finalize can publish the original package after main advances.

## Behavior

- New Stage retains `release-source/v<version>` at the exact caller SHA before preparation. It confirms the ref again after persisting the draft/assets and before npm staging.
- An existing matching ref is reusable. A different source SHA, malformed response, or permission failure stops staging. Creation races are accepted only after confirming the same persisted SHA.
- Failed builds, draft saves, staging and receipt updates retain the ref. Existing draft and legacy publication no-ops do not resend npm or rewrite refs.
- Finalize checks public npm and the saved assets, publishes the draft and verifies the version tag before cleanup. Cleanup uses `git push --force-with-lease=<ref>:<saved-sha>` for atomic deletion; credentials are passed through environment Git configuration rather than command arguments.
- A missing source branch is a successful cleanup no-op for older releases and retries. A moved branch is retained. Cleanup failures leave the published release intact and can be retried without publishing again.
- Verify remains read-only. Workflow inputs, outputs, operation permissions and caller concurrency are unchanged.

Source retention starts before the long build but cannot guarantee that a queued run's SHA is still main's head. Creation can still require maintainer recovery if workflows changed before the ref was retained. The helper never retargets source to latest main.

## Validation

All 52 tests passed on Node 26.11.1 and npm 11.21.0. Added regressions cover source-creation failure before preparation, ref rechecking before npm staging, conflicting refs, concurrent creators, malformed/denied API responses, source retention after failures, tag verification before cleanup, absent refs, and cleanup retries after publication. Local real-Git tests prove both successful deletion and lease rejection when a branch moves between the API read and push.

Strict TypeScript, Biome, workflow/caller contracts, actionlint and whitespace checks passed. Tests use local repositories and mocked GitHub responses; they do not publish npm packages or mutate remote release state.

## Deployment

Commit helper changes first, then pin all five workflow operation jobs to that existing implementation commit. Preserve both commits in shared main before updating the changelog caller. Confirm source-ref creation/deletion with the caller's GitHub token and review the updated workflow before expanding to additional repositories.
