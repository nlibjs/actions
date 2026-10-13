# Automatic source-retention verification

Historical snapshot: 2026-10-12. [Actions #8](https://github.com/nlibjs/actions/pull/8) added this to Stage/Finalize; [#10](https://github.com/nlibjs/actions/pull/10) replaced it with Release-triggered deployment. Current operations are in the [README](../../../README.md).

## Purpose

The changelog pilot needed a temporary source branch after workflow changes on main caused GitHub to reject publishing its saved commit. The implementation retained that ref during Stage so Finalize could publish the original package after main advanced.

## Behavior

- Stage retained `release-source/v<version>` at the exact caller SHA before preparation. It confirmed the ref again after persisting the draft/assets and before npm staging.
- An existing matching ref was reusable. A different source SHA, malformed response, or permission failure stopped staging. Creation races were accepted only after confirming the same persisted SHA.
- Failed builds, draft saves, staging, and receipt updates retained the ref. Existing draft and legacy publication no-ops did not resend npm or rewrite refs.
- Finalize checked public npm and the saved assets, published the draft and verified the version tag before cleanup. Cleanup used `git push --force-with-lease=<ref>:<saved-sha>` for atomic deletion; credentials were passed through environment Git configuration rather than command arguments.
- A missing source branch was a successful cleanup no-op for older releases and retries. A moved branch was retained. Cleanup failures left the published release intact and could be retried without publishing again.
- Verify remained read-only. Workflow inputs, outputs, operation permissions and caller concurrency were unchanged.

Source retention started before the long build but could not guarantee that a queued run's SHA was still main's head. Creation could still require maintainer recovery if workflows changed before the ref was retained. The helper never retargeted source to latest main.

## Validation

All 52 tests passed on Node 26.11.1 and npm 11.21.0. Added regressions cover source-creation failure before preparation, ref rechecking before npm staging, conflicting refs, concurrent creators, malformed/denied API responses, source retention after failures, tag verification before cleanup, absent refs, and cleanup retries after publication. Local real-Git tests prove both successful deletion and lease rejection when a branch moves between the API read and push.

Strict TypeScript, Biome, workflow/caller contracts, actionlint and whitespace checks passed. Tests use local repositories and mocked GitHub responses; they do not publish npm packages or mutate remote release state.

## Implementation pin

Helper: `70dd80ae972e812efcc9606d0ec5d514c8be3982`. All five operation jobs pinned it in the subsequent workflow commit. Both were preserved in main.

## Hosted source-ref verification

[Run 38245008516](https://github.com/nlibjs/actions/actions/runs/38245008516) passed against production adapters with the GitHub token and contents write. It created and reused a temporary source ref, deleted it through authenticated Git with the saved-SHA lease, and verified absent-ref cleanup retries. The ref and temporary validation branch are deleted. No npm staging or Release publication was performed.
