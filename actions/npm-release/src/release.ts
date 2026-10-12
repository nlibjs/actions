import { readFile } from 'node:fs/promises';
import {
  changelogNotes,
  decideStage,
  finalizeInstructions,
  INTEGRITY_ASSET,
  optionalStageId,
  SHA,
  selectRelease,
  TARBALL_ASSET,
  validateInputs,
  validateManifest,
} from './policy.ts';
import type {
  NpmState,
  PackageMetadata,
  RawInputs,
  Release,
  ReleaseInputs,
  ReleaseOutputs,
  Runtime,
} from './types.ts';

const output = (
  pkg: PackageMetadata,
  sha: string,
  npmState: NpmState,
  release: Release | null,
  ready = false,
): ReleaseOutputs => ({
  'package-name': pkg.name,
  version: pkg.version,
  tag: `v${pkg.version}`,
  'source-sha': sha,
  'npm-state': npmState,
  'github-state': release ? (release.draft ? 'draft' : 'published') : 'absent',
  'jsr-ready': ready ? 'true' : 'false',
  'release-url': release?.html_url || '',
});

export async function runRelease(raw: RawInputs, io: Runtime): Promise<ReleaseOutputs> {
  const input = validateInputs(raw);
  if (input.action === 'finalize') return finalize(input, io);
  const original = validateManifest(
    JSON.parse(await readFile(`${input.cwd}/package.json`, 'utf8')),
    input.repository,
  );
  if (input.cleanup === 'local' && original.name !== '@nlib/cleanup-package-json')
    throw new Error('Local cleanup is only for @nlib/cleanup-package-json');
  const tag = `v${original.version}`;
  if (input.action === 'stage') {
    const [releases, published, tagSha] = await Promise.all([
      io.releases(),
      io.published(original.name, original.version),
      io.tagSha(tag),
    ]);
    const release = selectRelease(releases, tag);
    const decision = decideStage({ release, published, tagSha });
    if (decision === 'published') {
      io.summary(
        `No-op: ${original.name}@${original.version} is already published and its tag exists. No new staging.`,
      );
      if (!tagSha) throw new Error('Published version has no tag');
      return output(original, tagSha, 'published', release);
    }
    if (decision === 'draft') {
      if (!release) throw new Error('Missing draft');
      const saved = await inspectAssets(release, input.repository, original.version, io);
      if (published && published.dist?.integrity !== saved.integrity)
        throw new Error('Published npm integrity differs from the draft tarball');
      const confirmed = release.body?.includes('\n\nStaging succeeded.');
      if (!published && !confirmed) {
        io.summary(
          `Staging is unconfirmed for ${tag}. The draft is retained and nothing was re-sent. Inspect npm Staged Packages and the public registry before recovery.`,
        );
        throw new Error('npm staging result is unknown; inspect npm and the saved draft');
      }
      io.summary(
        `No-op: existing draft for ${tag}; no re-staging. ${finalizeInstructions(original.version)} If the prior command failed, check npm Staged Packages before any retry.`,
      );
      return output(original, saved.sha, published ? 'published' : 'staged', release);
    }
  }

  await io.prepare(input.cwd);
  const notes = changelogNotes(await readFile(`${input.cwd}/CHANGELOG.md`, 'utf8'), tag);
  await io.cleanup(input.cwd, input.cleanup);
  const prepared = await io.pack(input.cwd);
  validateManifest(prepared.pkg, input.repository);
  for (const key of [
    'name',
    'version',
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'exports',
    'imports',
    'main',
    'bin',
    'types',
    'typings',
    'typesVersions',
    'sideEffects',
    'publishConfig',
  ]) {
    if (JSON.stringify(original[key]) !== JSON.stringify(prepared.pkg[key]))
      throw new Error(`Packaging changed consumer field: ${key}`);
  }
  if (prepared.pkg.devDependencies || prepared.pkg.renovate)
    throw new Error('Cleanup did not remove development metadata');
  io.summary(
    `Verified ${original.name}@${original.version}; cleanup=${input.cleanup}; tarball integrity=${prepared.integrity}.\nFiles:\n${prepared.files.map((f) => `- ${f}`).join('\n')}`,
  );
  if (input.action === 'verify') return output(original, input.sha, 'unknown', null);

  // Re-check immediately before creating a draft, after the potentially long build.
  const releaseAtWrite = selectRelease(await io.releases(), tag);
  if (
    releaseAtWrite ||
    (await io.tagSha(tag)) ||
    (await io.published(original.name, original.version))
  )
    throw new Error('Release state changed during preparation; rerun to inspect it');
  const instructions = finalizeInstructions(original.version);
  const release = await io.createDraft(
    tag,
    input.sha,
    `${notes}\n\n## npm approval\n\nStaging not confirmed yet.\n\n${instructions}`,
  );
  await io.upload(release, TARBALL_ASSET, prepared.tarball);
  await io.uploadText(release, INTEGRITY_ASSET, `${prepared.integrity}\n`);
  const persisted = selectRelease(await io.releases(), tag);
  if (!persisted || persisted.id !== release.id)
    throw new Error('Could not confirm unique draft before staging');
  const saved = await inspectAssets(persisted, input.repository, original.version, io);
  if (saved.sha !== input.sha || saved.integrity !== prepared.integrity)
    throw new Error('Saved draft differs from the prepared tarball');

  const result = await io.stage(prepared.tarball);
  if (result.code !== 0) {
    io.summary(
      `npm staging did not exit successfully (exit ${result.code ?? 'unknown'}). The draft is retained. Check npm Staged Packages before retrying; do not delete the draft and re-stage blindly.`,
    );
    throw new Error('npm staging result is unknown; inspect npm and the saved draft');
  }
  const stageId = optionalStageId(result.stdout);
  io.summary(
    `npm staging succeeded.${stageId ? ` Stage ID: ${stageId}.` : ' Stage ID was not extracted; use npmjs.com Staged Packages.'} ${instructions}`,
  );
  // A receipt update can fail, but it must not change the fact npm exited 0.
  await io.updateBody(
    release,
    `${notes}\n\n## npm approval\n\nStaging succeeded.${stageId ? ` Stage ID: ${stageId}.` : ''}\n\n${instructions}`,
  );
  return output(original, input.sha, 'staged', release);
}

async function inspectAssets(release: Release, repository: string, version: string, io: Runtime) {
  if (!SHA.test(release.target_commitish || ''))
    throw new Error('Release target_commitish must be a full commit SHA');
  if (release.tag_name !== `v${version}`)
    throw new Error('Release tag does not match requested version');
  const assets = release.assets || [];
  for (const name of [TARBALL_ASSET, INTEGRITY_ASSET]) {
    if (assets.filter((a) => a.name === name && a.state === 'uploaded').length !== 1)
      throw new Error(`Missing or duplicate uploaded asset: ${name}`);
  }
  const tarballAsset = assets.find((a) => a.name === TARBALL_ASSET);
  const integrityAsset = assets.find((a) => a.name === INTEGRITY_ASSET);
  if (!tarballAsset || !integrityAsset) throw new Error('Missing release assets');
  const tarball = await io.download(tarballAsset);
  const expected = (await io.downloadText(integrityAsset)).trim();
  const inspected = await io.inspectTarball(tarball);
  validateManifest(inspected.pkg, repository);
  if (inspected.pkg.version !== version || inspected.integrity !== expected)
    throw new Error('Draft tarball, version and integrity disagree');
  return { ...inspected, sha: release.target_commitish };
}

async function finalize(input: ReleaseInputs, io: Runtime): Promise<ReleaseOutputs> {
  const release = selectRelease(await io.releases(), `v${input.version}`);
  if (!release) throw new Error('No saved release for this version; stage a new version first');
  const saved = await inspectAssets(release, input.repository, input.version, io);
  const published = await io.published(saved.pkg.name, input.version);
  if (!published) throw new Error('npm version is not public yet; approve it before finalize');
  if (published.dist?.integrity !== saved.integrity)
    throw new Error('Published npm integrity differs from the saved tarball');
  validateManifest(published, input.repository);
  const tagSha = await io.tagSha(release.tag_name);
  if (tagSha && tagSha !== saved.sha)
    throw new Error(`Existing tag points at ${tagSha}, expected ${saved.sha}`);
  if (!release.draft && !tagSha) throw new Error('Published GitHub release has no tag');
  const final = release.draft ? await io.publishDraft(release) : release;
  const afterSha = await io.tagSha(release.tag_name);
  if (afterSha !== saved.sha) throw new Error('Published release tag does not match the saved SHA');
  io.summary(
    `Finalized ${saved.pkg.name}@${input.version} from ${saved.sha}. npm integrity matches. JSR may run or retry independently.`,
  );
  return output(saved.pkg, saved.sha, 'published', final, true);
}
