# Shared release workflow design

The Release-triggered implementation is deployed. Operating instructions and the interface are in the [README](../../../README.md); rollout is tracked in the [plan](plan.md).

## Release identity

A published GitHub Release provides the version tag and source commit. Both registry jobs use that resolved commit, so main can advance without changing the package being distributed. Manual deployment selects the same tag to keep provenance tied to the built commit.

The workflow validates stable Release status, tag/version agreement, repository identity, and consumer fields after cleanup. JSR callers additionally validate their package metadata and exports.

## Independent destinations

npm stages a package for maintainer approval. JSR publishes independently from the same source. GitHub Release and JSR can become available before npm; each destination has its own outcome and retry.

Version-specific caller concurrency serializes attempts for one Release while allowing different versions and parallel registry jobs.

## Evidence and retries

Before npm receives a tarball, its expected integrity is saved in a workflow artifact. A second artifact records the staging result. Evidence binds package identity to the Release ID, tag, and source SHA.

Public npm lookup cannot detect pending versions. Missing evidence therefore cannot establish that nothing was submitted. Stage checks the separate submission step's history automatically: pre-submission failures can be retried, while an uncertain submission requires registry inspection. This depends on retaining both workflow history and artifacts.

Only integrity and receipts need persistence because npm approval completes publication. The workflow stages the inspected tarball without storing it or modifying the published Release, supporting immutable Releases.

## Permissions and implementation pins

Verify and source resolution are read-only. Stage additionally needs artifact reads and OIDC. Publishing jobs inherit caller permissions because GitHub checks skipped reusable jobs against the caller's permission ceiling. An optional deployment environment protects one Stage job.

A workflow commit pins an already-existing helper commit. Both must remain in shared main history so callers can use reviewed, reproducible implementations.

## Historical design

The original workflow created drafts, staged saved tarballs, and published through Finalize. Its [verification records](record.md) remain relevant to callers pinned to that implementation. Migration completes or recovers pending attempts before replacing their triggers.
