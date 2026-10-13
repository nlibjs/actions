# Draft-tag preservation verification

Historical snapshot: 2026-10-12. This concerns the retired Stage/Finalize workflow. Current operations are in the [README](../../../README.md).

## Failure and fix

Changelog 0.4.1 [Stage](https://github.com/nlibjs/changelog/actions/runs/38216376403) succeeded from `4cb86276ec6de60cd427b5fd9d11e8a786e88b2f`. npm approval made the same tarball public.

[Finalize](https://github.com/nlibjs/changelog/actions/runs/38221005474) found no Release tagged v0.4.1. A read-only [diagnostic](https://github.com/nlibjs/changelog/actions/runs/38222414523) identified Release `410299307` with title v0.4.1 but tag `untagged-94c172aab9e9b915f320`. The staging receipt PATCH had sent only the body, replacing the uncreated tag while preserving the visible title and saved assets.

[Actions #6](https://github.com/nlibjs/actions/pull/6) included tag_name and full target_commitish in receipt/publication PATCHes and validated the returned identity and draft state. Helper: `d685c67777dfeb0325ecc707533bf5dddbd26439`.

## Validation and recovery

All 39 tests passed, including omitted-tag and changed-identity regressions. Type checking, Biome, workflow contracts, actionlint, and whitespace checks passed.

[Recovery](https://github.com/nlibjs/changelog/actions/runs/38222860101) verified the saved source and assets against public npm, then restored the draft tag without resubmitting npm.

```text
sha512-4J0t1edsA8NhVAZwBjnPsf6uRDLRdHdKUBZihsDiQpq31MVuX6biX+LdC/i3jkPvWE4NRcLMVn1cG6uY1QdQqA==
```

[Finalization attempt 2](https://github.com/nlibjs/changelog/actions/runs/38240278529/attempts/2) later passed after retaining a temporary source ref. The tag matched the saved SHA and the branch was deleted. See the [pilot results](../t005-changelog-pilot/verification.md).
