# Initial changelog adoption verification

Historical snapshot: 2026-10-12. [Changelog #554](https://github.com/nlibjs/changelog/pull/554) adopted the Stage/Finalize workflow, later replaced by [#560](https://github.com/nlibjs/changelog/pull/560).

Candidate: `fa7ce4bb829dd4f83b7d958a7d5feec23a376166`. Base: `0b2b586369483cab60c5096d72dcc6dedc6012eb`. Shared workflow: `bdf4f40eafc6fd4732bb30f46fe4d611d44cb198`; helper: `ca360dbda6c47172efe9f06fee633b7e5f524609`.

## Validation

Node 26.11.1, npm 11.21.0, locked dependencies, cleanup-package-json 0.5.0, and actionlint 1.7.12 were used.

- lint, all 74 tests, build, and production shared Verify passed.
- Throwing guards confirmed Verify called no release-state or publication methods.
- Caller contracts, actionlint, and whitespace checks passed.
- Installing the cleaned tarball passed CLI help and v0.4.0 changelog generation.
- Existing OS/Node compatibility checks ran separately in [CI](https://github.com/nlibjs/changelog/actions/runs/38208801858).

## Cleanup comparison

| Item | Before | After |
|---|---|---|
| Version | 0.4.0 | 0.4.0 |
| Files | 39 | 39 |
| Compressed bytes | 13,546 | 13,452 |
| Unpacked bytes | 41,740 | 41,595 |
| devDependencies and renovate | Present | Removed |
| Other 38 files | Byte-identical | Byte-identical |

Only package.json changed during cleanup; all consumer fields were preserved. The existing main entry referenced a missing file, while the CLI entry worked. [#556](https://github.com/nlibjs/changelog/pull/556) subsequently removed that main entry.

## Nested-permission failure

The first adopted [Verify run](https://github.com/nlibjs/changelog/actions/runs/38209633075) failed before any job started: skipped publishing jobs requested writes above the read-only caller's permission ceiling. Local checks had not covered that combination.

[Actions #5](https://github.com/nlibjs/actions/pull/5) made publishing jobs inherit caller permissions and added whole-graph permission checks. [Changelog #555](https://github.com/nlibjs/changelog/pull/555) adopted the correction. The completed [0.4.1 pilot](../t005-changelog-pilot/verification.md) verified real publication.
