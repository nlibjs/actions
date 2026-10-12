# npm release TypeScript migration

Issue: [#2](https://github.com/nlibjs/actions/issues/2). Base: PR #1's merge commit `e463599b9a24190644b5d32475d818d04acd57dd`.

## Implementation and compatibility

The helper, tests, and workflow contract script now use `.ts` ES modules. Node 26 runs source directly with its built-in type stripping. The composite entry point is `src/cli.ts`; the external cleanup dependency still uses its published `esm/cli.mjs`. No JavaScript output or TypeScript runtime loader is introduced.

Development dependencies pin TypeScript 6.0.3 and Node types 26.6.4. The root `tsconfig.json` covers source, tests, and scripts with strict checking, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `noEmit`. CI runs `npm run typecheck`; existing Biome globs also cover the migrated source and root configuration.

Inputs, outputs, release states, package metadata, GitHub Releases/assets/tag objects, command results, and the runtime adapter have explicit contracts. Fixture adapters and overrides are checked against the production interface. External JSON enters as `unknown` and is checked before use; no type assertions replace validation. Unexpected shapes fail visibly. Consumer fields remain available for package-preservation checks.

The workflow's inputs, outputs, job permissions and environments are unchanged. R2's staging receipts, optional stage IDs, saved tarball/integrity checks, fixed target SHA, successful no-ops, and refusal to re-stage an unconfirmed draft remain covered by the existing tests. Workflow contract checks additionally require the TypeScript entry point, the output names, and the CI typecheck step.

## Validation (2026-10-12)

Environment: Node 26.11.1, npm 11.21.0, TypeScript 6.0.3, Biome 2.5.15, actionlint 1.7.12. Dependencies use their committed lockfiles. The actionlint release archive was verified against its published SHA-256 checksum.

- `npm run typecheck`: passed for source, tests, and scripts.
- `npm test`: all 33 tests passed (the 25 existing tests plus eight JSON/adapter/CLI regressions).
- `npm run lint`: passed with no warnings.
- `npm run check`: passed workflow YAML, pinned refs, permissions, output and caller contracts.
- `actionlint -shellcheck= .github/workflows/*.yml examples/*.yml`: passed; shellcheck was disabled for consistency with the existing local validation environment.
- `git diff --check`: passed.

The tarball staging test uses npm 11.21.0 with `--dry-run` and a local registry fixture that rejects writes. npm response tests use a local command fixture; GitHub tests use injected responses. The CLI is also executed directly as TypeScript and rejects invalid inputs before writing workflow outputs. No real package publication, draft Release mutation, OIDC signing, or caller adoption is performed.

## Helper pin and merge procedure

Implementation commit A is `ca360dbda6c47172efe9f06fee633b7e5f524609`. The subsequent commit B pins all five helper references in `npm-release.yml` to A. Check that A contains the `.ts` entry point and source, is an ancestor of B, and that B pins A. Open the follow-up PR against main and use **Create a merge commit** to retain A. After merging, verify that A is an ancestor of main before proposing B to callers. The README documents the alternative two-PR process if repository policy requires squash or rebase.

Technical review and the user's merge decision remain pending. Real OIDC/provenance validation belongs to the pilot release described in the shared workflow plan.
