# Changelog 0.4.1 pilot results

Historical snapshot: 2026-10-12, for the retired Stage/Finalize workflow. The Release-triggered pilot is in the [current verification record](../t001-shared-workflows/record.md).

`@nlib/changelog@0.4.1` is public on npm and [GitHub Releases](https://github.com/nlibjs/changelog/releases/tag/v0.4.1). The npm package, saved GitHub assets, provenance source and version tag agree.

## Release identity

| Item | Value |
| --- | --- |
| Saved source and `v0.4.1` tag | `4cb86276ec6de60cd427b5fd9d11e8a786e88b2f` |
| Caller at finalization | `8c2ffd6b77363b8159b55a83a90594d9ffdb5137` |
| Workflow at finalization | `1ff589ed2dc842961210788eae5d19716c8c50fd` |
| Helper at finalization | `d685c67777dfeb0325ecc707533bf5dddbd26439` |
| GitHub Release ID | `410299307` |
| Saved assets | `package.tgz`, `package.integrity` |
| Package files | 39, including the CLI bin |

Saved, public npm and downloaded GitHub tarball integrity:

```text
sha512-4J0t1edsA8NhVAZwBjnPsf6uRDLRdHdKUBZihsDiQpq31MVuX6biX+LdC/i3jkPvWE4NRcLMVn1cG6uY1QdQqA==
```

## Verification evidence

| Check | Result |
| --- | --- |
| Read-only shared Verify | [Run 38211763002](https://github.com/nlibjs/changelog/actions/runs/38211763002) passed |
| Stage, locked build and tests | [Run 38216376403](https://github.com/nlibjs/changelog/actions/runs/38216376403) passed; all 74 package tests passed |
| npm Trusted Publisher | Maintainer confirmed nlibjs/changelog, release.yml, empty environment; real OIDC staging succeeded |
| Public provenance | SLSA v1 subject digest matches the tarball; source is the saved SHA; invocation identifies the Stage run |
| Registry signatures and attestations | Hosted [npm audit signatures](https://github.com/nlibjs/changelog/actions/runs/38220663728) verified 3 package signatures and 2 attestations |
| Maintainer approval | npm 0.4.1 became public with the saved integrity |
| Finalization | [Run 38240278529, attempt 2](https://github.com/nlibjs/changelog/actions/runs/38240278529/attempts/2) passed |
| Published assets and tag | Downloaded both assets, recomputed SHA-512, inspected package/version/CLI, and checked the tag against the saved source |

## Findings and recovery

1. **Nested permissions:** GitHub checks skipped reusable jobs against the caller's permission ceiling. [Actions #5](https://github.com/nlibjs/actions/pull/5) fixed publishing-job inheritance; [changelog #555](https://github.com/nlibjs/changelog/pull/555) adopted it.
2. **Draft tag identity:** The staging receipt PATCH omitted `tag_name`, replacing the uncreated version tag with `untagged-*` while retaining the visible title. [Actions #6](https://github.com/nlibjs/actions/pull/6) preserves and validates tag/source identity; [changelog #558](https://github.com/nlibjs/changelog/pull/558) adopted it. [Verified recovery](https://github.com/nlibjs/changelog/actions/runs/38222860101) restored the existing draft tag after checking its assets against public npm.
3. **Publication permissions:** Finalization returned `403` after the caller workflow changed on main. The saved commit had no direct branch/tag ref. [GitHub requires additional workflow permission in this situation](https://github.blog/changelog/2023-11-02-github-actions-enforcing-workflow-scope-when-creating-a-release/). Creating `release-source/0.4.1` at the saved SHA allowed the unchanged Finalize job to succeed. The branch was deleted after verifying the published tag.

Recovery retained the saved package and source throughout. Finalization used the staged tarball rather than rebuilding current main.

## Follow-up

[Actions #8](https://github.com/nlibjs/actions/pull/8) added [automatic source retention](../t006-source-ref-retention/verification.md) after the pilot. [Actions #10](https://github.com/nlibjs/actions/pull/10) subsequently replaced draft finalization and temporary source refs with Release-triggered deployment.
