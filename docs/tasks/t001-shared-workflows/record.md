# Shared workflow verification record

Snapshot: 2026-10-13. Current operations are in the [README](../../../README.md); remaining adoption work is in the [plan](plan.md).

## Release-triggered implementation

[Actions #10](https://github.com/nlibjs/actions/pull/10) replaced draft publication, Finalize, and temporary source branches with published-Release deployment. Preparation and submission are separate steps so failed preparation can be retried while uncertain submissions remain blocked.

Workflow: `cde77910e399ec821de29a242f01e44311461605`. Helper: `4e12232e9335a9e28acd488867d3a9411f0a5904`. Both are preserved in main. All 32 tests and [hosted CI](https://github.com/nlibjs/actions/actions/runs/38268104808) passed.

## Changelog 0.4.2 pilot

| Check | Evidence |
|---|---|
| Source and tag | `beda9f906db50d93c55984df29bec1aa66c4ba0e` |
| Published Release | [v0.4.2](https://github.com/nlibjs/changelog/releases/tag/v0.4.2) |
| Automatic Stage | [Run 38323334620](https://github.com/nlibjs/changelog/actions/runs/38323334620): 74 tests, cleanup, pack, and staging passed |
| Evidence persistence | Prepared and result artifacts were saved; prepared evidence was read back before submission |
| npm approval | Public npm integrity matches the staged package |
| Provenance | Subject digest matches integrity; source matches the tag; invocation identifies the Stage run |
| Signatures and installed CLI | [Run 38324961994](https://github.com/nlibjs/changelog/actions/runs/38324961994): 3 verified signatures, 2 verified attestations, CLI version/help passed |

Verified package integrity:

```text
sha512-zpU8PCbN9Dg4Uslyz66Lhu54EAef1GML0pYYMiocAuU5NIwhXHxKJF5nspZEKeGOEmhusPAf+e5lfuAT6xc3KA==
```

## Caller migration

Changelog [#560](https://github.com/nlibjs/changelog/pull/560) and lint-commit [#730](https://github.com/nlibjs/lint-commit/pull/730) are merged. Read-only shared Verify passed [74 changelog tests](https://github.com/nlibjs/changelog/actions/runs/38270659119) and [47 lint-commit tests](https://github.com/nlibjs/lint-commit/actions/runs/38325099482). Lint-commit retained its deployment environment.

Cleanup-package-json [#563](https://github.com/nlibjs/cleanup-package-json/pull/563) is in review. [Shared Verify](https://github.com/nlibjs/cleanup-package-json/actions/runs/38326064568) passed 16 tests, its built local cleanup CLI, and tarball inspection.

## Historical Stage/Finalize implementation

These dated records describe the previous implementation, including its recovery procedures.

- [Initial implementation verification](verification.md)
- [TypeScript migration](../t002-release-typescript/verification.md)
- [Changelog adoption and nested-permission failure](../t003-changelog-adoption/verification.md)
- [Draft-tag preservation](../t004-draft-tag-preservation/verification.md)
- [Changelog 0.4.1 pilot](../t005-changelog-pilot/verification.md)
- [Automatic source retention](../t006-source-ref-retention/verification.md)
