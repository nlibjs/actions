# Preserve draft release tags

## Pilot failure and diagnosis

The changelog 0.4.1 Stage [run 38216376403](https://github.com/nlibjs/changelog/actions/runs/38216376403) succeeded from `4cb86276ec6de60cd427b5fd9d11e8a786e88b2f`. Before staging, the helper re-read the draft and checked its version tag, source SHA, saved package and integrity. npm approval subsequently made the same package public. Hosted [signature verification](https://github.com/nlibjs/changelog/actions/runs/38220663728) passed.

The first Finalize [run 38221005474](https://github.com/nlibjs/changelog/actions/runs/38221005474) stopped before any publication because no release matched `v0.4.1`. The maintainer's screenshot confirmed that the draft title remained `v0.4.1` with two assets and a successful staging receipt.

An authenticated, read-only hosted [diagnostic run](https://github.com/nlibjs/changelog/actions/runs/38222414523) found release ID `410299307`, title `v0.4.1`, and tag `untagged-94c172aab9e9b915f320`. The saved source and both asset names were unchanged. Its update timestamp, `2026-10-12T07:12:10Z`, matches the Stage receipt PATCH. That PATCH sent only the body; the uncreated draft tag was replaced with an untagged placeholder. The UI title masked the changed API tag. The temporary diagnostic branch is not intended for merge.

## Fix

Both receipt updates and draft publication explicitly send the saved `tag_name` and full `target_commitish`. Decode the PATCH response and require the same release ID, tag, source, and requested draft state. A changed identity now fails immediately rather than reporting a successful receipt update.

Keep exact tag selection and all saved-asset, npm-integrity, and source checks. Do not infer a release's version from its title or adopt arbitrary untagged drafts. The missing-release error directs maintainers to inspect draft tags and assets instead of suggesting blind re-staging.

## Validation

Regression tests emulate GitHub replacing an omitted tag during receipt updates and publication. They also reject changed release IDs, tags, targets, and draft states in PATCH responses. All 39 tests passed. Strict TypeScript, Biome, workflow/caller contracts, actionlint, and whitespace validation passed. The first sandbox-only test invocation could not run its network-dependent npm subprocesses; the complete suite passed with the configured network access.

## Existing pilot recovery

The already-public npm package must not be staged again. Restore the existing draft's tag to `v0.4.1` only after verifying release ID, saved source, tarball name/version/repository, saved SHA-512, and public npm integrity. Preserve the assets and body, keep the release a draft, and do not create a Git tag during recovery. Then use the corrected, reviewed caller pin for Finalize. The maintainer starts Finalize; it checks public npm and publishes the saved release and version tag.

Expected package integrity: `sha512-4J0t1edsA8NhVAZwBjnPsf6uRDLRdHdKUBZihsDiQpq31MVuX6biX+LdC/i3jkPvWE4NRcLMVn1cG6uY1QdQqA==`.

## Immutable pins

Helper implementation: `d685c67777dfeb0325ecc707533bf5dddbd26439`. The subsequent workflow commit pins this existing helper in all five operation jobs. Preserve both commits with a merge commit, then update callers to the reviewed workflow commit.
