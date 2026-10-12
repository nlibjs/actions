# Shared workflow implementation and review plan

Status: changelog's 0.4.1 pilot and adoption in lint-commit and cleanup-package-json are complete. Further adoption is paused for the Release-triggered lifecycle in [design.md](design.md).

## Checkpoints

| Phase | Deliverable | Condition to proceed |
|---|---|---|
| Revised design review | Release-triggered npm/JSR lifecycle, retry interface, and evidence retention | Technical review and maintainer approval |
| Shared implementation | Workflow, helper, caller examples, and common README | Validation and reviewed PR merged |
| Changelog migration | Release-triggered caller pinned to the new implementation | Read-only checks pass; pending old attempts resolved |
| Normal release pilot | GitHub Release starts npm staging; maintainer approves npm | Source, provenance, tarball integrity, and retry behavior verified |
| Existing caller migration | Separate lint-commit and cleanup-package-json PRs | Review, merge, and verify each caller |
| JSR caller adoption | Separate typing and negotiate PRs | Parallel publishing and independent recovery verified |
| Personal repository adoption | Selected gjbkz repository | Owner-independent reuse verified |
| Compatibility CI work | Separate CI PRs | Existing coverage and required checks retained |

Codex prepares implementations, verification, and review fixes. Claude performs technical review; the maintainer shares review material, approves and merges PRs, publishes GitHub Releases, and approves npm with 2FA.

## Next implementation work

1. Persist expected integrity before submission and the staging result afterward as workflow artifacts with maximum permitted retention. Missing or expired evidence reports registry state without resending; uncertain pending state requires maintainer inspection.
2. Implement `release: published` source validation and tag-based manual retries. Preserve read-only Verify and remove Finalize from the new interface.
3. Remove draft/Release publication and temporary source-ref management from the new path. Keep historical pinned implementations usable for existing pending attempts.
4. Run npm Stage and caller JSR jobs in parallel from the same resolved tag SHA. Validate registry metadata and existing content independently.
5. Update examples and common README, then migrate changelog before further rollout.

Caller documentation cleanup is prepared separately in changelog #560, lint-commit #730, and cleanup-package-json #563. Keep package-specific settings in workflow comments; common instructions belong in the shared README.

## Validation

- Reject draft/prerelease explicitly, including prereleases delivered by `release: published`; reject tag/version mismatch, moved tags, invalid metadata, and unauthorized publishing events.
- Confirm both destinations use the same tag commit even when main advances.
- Verify npm provenance, mandatory registry/local cleanup, and consumer fields in the actual tarball.
- Test pending/public/unknown npm states and failures between submission and receipt persistence. Never resend automatically after an uncertain outcome.
- Verify existing JSR content and exports, and fail on conflicts or communication errors.
- Confirm npm failure does not block JSR and JSR retry does not resend npm.
- Test immutable Releases, artifact expiry, same-version concurrency, distinct-version queuing, protected environments, and nested permissions.
- Confirm the chosen GitHub Release creation path triggers deployment; GITHUB_TOKEN-created Releases need explicit workflow invocation.
- Compare package contents in every caller migration and retain compatibility checks.

Use fixtures and read-only hosted checks during development. Validate real registry publication during normal approved releases. Automatic post-approval monitoring remains a separate decision.

## Migration and records

Inventory old pending npm versions, drafts, and temporary source refs before changing each caller. Complete or recover them using their reviewed pinned implementation. Replace package.json-triggered staging and Finalize callers together with the new Release trigger.

Keep historical evidence in record.md and linked task records. Update current operating instructions when the implementation lands. Helper changes require a commit followed by a workflow commit pinning that helper; propose the validated workflow SHA to callers through individual PRs.
