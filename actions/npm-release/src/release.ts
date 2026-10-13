import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { record } from './json.ts';
import { changelogNotes, validateInputs, validateManifest } from './policy.ts';
import type { Evidence, RawInputs, Release, ReleaseInputs, Runtime } from './types.ts';

function checkEvidence(value: unknown, expected: Evidence): Evidence {
  const saved = record(value, 'staging evidence');
  for (const key of ['repository', 'release', 'tag', 'sha', 'name', 'version'] as const)
    if (saved[key] !== expected[key]) throw new Error(`Staging evidence conflicts: ${key}`);
  if (typeof saved.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(saved.integrity))
    throw new Error('Invalid saved integrity');
  if (!['prepared', 'unknown', 'staged'].includes(String(saved.state)))
    throw new Error('Invalid saved staging state');
  return saved as unknown as Evidence;
}

async function source(input: ReleaseInputs, io: Runtime): Promise<Release> {
  const release = await io.release(input.tag);
  if (
    release.draft ||
    release.prerelease ||
    release.tag_name !== input.tag ||
    (input.releaseId !== undefined && release.id !== input.releaseId) ||
    (await io.tagSha(input.tag)) !== input.sha
  )
    throw new Error('Published Release or source tag changed');
  return release;
}

export async function runRelease(
  raw: RawInputs,
  io: Runtime,
  evidencePath: string,
): Promise<{ submit: string; tarball?: string }> {
  const input = validateInputs(raw);
  const original = validateManifest(
    JSON.parse(await readFile(join(input.cwd, 'package.json'), 'utf8')),
    input.repository,
  );
  if (input.cleanup === 'local' && original.name !== '@nlib/cleanup-package-json')
    throw new Error('Local cleanup is only for @nlib/cleanup-package-json');
  const tag = `v${original.version}`;
  if (input.action === 'stage' && input.tag !== tag)
    throw new Error('Release tag and package version differ');
  const release = input.action === 'stage' ? await source(input, io) : null;
  const expected: Evidence = {
    repository: input.repository,
    release: release?.id || 0,
    tag,
    sha: input.sha,
    name: original.name,
    version: original.version,
    integrity: '',
    state: 'prepared',
  };
  if (release) {
    const published = await io.published(original.name, original.version);
    io.summary(
      `${original.name}@${original.version}: public npm state=${published ? 'published' : 'absent (pending state requires npmjs.com inspection)'}.`,
    );
    const saved = (await io.evidence(tag)).map((value) => checkEvidence(value, expected));
    if (saved.some((e) => e.integrity !== saved[0]?.integrity))
      throw new Error('Conflicting saved integrities');
    if (published) {
      if (!saved.length || published.dist?.integrity !== saved[0]?.integrity)
        throw new Error('Missing evidence or published npm integrity mismatch; nothing was resent');
      validateManifest(published, input.repository);
      io.summary('Published npm integrity matches the saved evidence.');
      return { submit: 'false' };
    }
    if (saved.some((e) => e.state === 'staged')) {
      io.summary(
        'Staging succeeded previously. Approve this version in npmjs.com → Staged Packages.',
      );
      return { submit: 'false' };
    }
    if (saved.some((e) => e.state === 'unknown') || (await io.submissionStarted(tag)))
      throw new Error(
        'Submission may have started without a successful receipt; inspect npm Staged Packages. Nothing was resent.',
      );
  }
  await io.prepare(input.cwd);
  changelogNotes(await readFile(join(input.cwd, 'CHANGELOG.md'), 'utf8'), tag);
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
  ])
    if (JSON.stringify(original[key]) !== JSON.stringify(prepared.pkg[key]))
      throw new Error(`Packaging changed consumer field: ${key}`);
  if (prepared.pkg.devDependencies || prepared.pkg.renovate)
    throw new Error('Cleanup did not remove development metadata');
  io.summary(
    `Verified ${original.name}@${original.version}; cleanup=${input.cleanup}; integrity=${prepared.integrity}.\n${prepared.files.join('\n')}`,
  );
  if (!release) return { submit: 'false' };
  await writeFile(evidencePath, JSON.stringify({ ...expected, integrity: prepared.integrity }));
  return { submit: 'true', tarball: prepared.tarball };
}

export async function submit(raw: RawInputs, io: Runtime, evidencePath: string, tarball: string) {
  const input = validateInputs(raw);
  if (input.action !== 'stage') throw new Error('Verify cannot submit');
  const value: unknown = JSON.parse(await readFile(evidencePath, 'utf8'));
  const packed = await io.inspectTarball(tarball);
  const pkg = validateManifest(packed.pkg, input.repository);
  const release = await source(input, io);
  const expected: Evidence = {
    repository: input.repository,
    release: release.id,
    tag: input.tag,
    sha: input.sha,
    name: pkg.name,
    version: pkg.version,
    integrity: '',
    state: 'prepared',
  };
  const local = checkEvidence(value, expected);
  const saved = (await io.evidence(input.tag)).map((e) => checkEvidence(e, expected));
  if (
    pkg.version !== input.tag.slice(1) ||
    local.state !== 'prepared' ||
    !saved.length ||
    saved.some((e) => e.state !== 'prepared' || e.integrity !== local.integrity)
  )
    throw new Error('Could not confirm prepared evidence before submission');
  if (packed.integrity !== local.integrity || (await io.published(pkg.name, pkg.version)))
    throw new Error('Tarball or registry state changed before submission');
  const receipt = { ...local, state: 'unknown' as 'unknown' | 'staged' };
  await writeFile(evidencePath, JSON.stringify(receipt));
  const result = await io.stage(tarball);
  if (result.code !== 0)
    throw new Error('npm submission outcome is unknown; inspect Staged Packages before recovery');
  receipt.state = 'staged';
  io.summary(
    `npm staging succeeded. Approve ${pkg.name}@${pkg.version} in npmjs.com → Staged Packages.`,
  );
  await writeFile(evidencePath, JSON.stringify(receipt));
}
