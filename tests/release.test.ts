import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import test from 'node:test';
import { validateInputs } from '../actions/npm-release/src/policy.ts';
import { runRelease, submit } from '../actions/npm-release/src/release.ts';
import type { Evidence, RawInputs, Runtime } from '../actions/npm-release/src/types.ts';

const sha = 'a'.repeat(40),
  repository = 'example/widget',
  tag = 'v1.2.3';
const integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
const pkg = {
  name: '@example/widget',
  version: '1.2.3',
  repository: `https://github.com/${repository}`,
  exports: { '.': './index.js' },
  devDependencies: { tool: '1.0.0' },
};
const release = {
  id: 1,
  tag_name: tag,
  draft: false,
  prerelease: false,
  html_url: `https://github.com/${repository}/releases/tag/${tag}`,
};
const expected: Evidence = {
  repository,
  release: 1,
  tag,
  sha,
  name: pkg.name,
  version: pkg.version,
  integrity,
  state: 'prepared',
};
async function fixture(t: TestContext, overrides: Partial<Runtime> = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'release-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(cwd, 'CHANGELOG.md'), `## ${tag} (2026-10-12)\n\nUseful change.\n`);
  const calls: string[] = [];
  const packed = {
    pkg: { ...pkg, devDependencies: undefined },
    integrity,
    tarball: '/package.tgz',
    files: ['package/package.json'],
  };
  const io: Runtime = {
    release: async () => release,
    tagSha: async () => sha,
    published: async () => null,
    evidence: async () => [],
    submissionStarted: async () => false,
    prepare: async () => {
      calls.push('prepare');
    },
    cleanup: async () => {
      calls.push('cleanup');
    },
    pack: async () => packed,
    inspectTarball: async () => packed,
    stage: async () => {
      calls.push('stage');
      return { code: 0, stdout: '{}' };
    },
    summary: () => {},
    ...overrides,
  };
  const input: RawInputs = { cwd, action: 'stage', tag, sha, repository, event: 'release' };
  const path = join(cwd, 'evidence.json');
  return { input, io, calls, path };
}

test('Verify uses no registry, Release, artifact or submission methods', async (t) => {
  const forbidden = async (): Promise<never> => {
    throw new Error('Unexpected release access');
  };
  const f = await fixture(t, {
    release: forbidden,
    tagSha: forbidden,
    published: forbidden,
    evidence: forbidden,
    submissionStarted: forbidden,
    stage: forbidden,
  });
  const input = { ...f.input, action: 'verify', tag: '', event: 'pull_request' };
  assert.equal((await runRelease(input, f.io, f.path)).submit, 'false');
  assert.deepEqual(f.calls, ['prepare', 'cleanup']);
});

test('initial staging prepares evidence; submission requires the artifact round trip', async (t) => {
  const f = await fixture(t);
  const ready = await runRelease(f.input, f.io, f.path);
  assert.equal(ready.submit, 'true');
  assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')), expected);
  await assert.rejects(
    submit(f.input, f.io, f.path, ready.tarball || ''),
    /confirm prepared evidence/,
  );
  assert.ok(!f.calls.includes('stage'));
  f.io.evidence = async () => [expected];
  await submit(f.input, f.io, f.path, ready.tarball || '');
  assert.equal(JSON.parse(await readFile(f.path, 'utf8')).state, 'staged');
  assert.deepEqual(f.calls, ['prepare', 'cleanup', 'stage']);
});

test('a failed or thrown submission leaves an unknown receipt and is never automatically resent', async (t) => {
  for (const fail of [
    async () => ({ code: 1, stdout: '' }),
    async (): Promise<never> => {
      throw new Error('connection lost');
    },
  ]) {
    const f = await fixture(t, { stage: fail });
    await runRelease(f.input, f.io, f.path);
    f.io.evidence = async () => [expected];
    await assert.rejects(submit(f.input, f.io, f.path, '/package.tgz'));
    const receipt = JSON.parse(await readFile(f.path, 'utf8'));
    assert.equal(receipt.state, 'unknown');
    f.io.evidence = async () => [expected, receipt];
    await assert.rejects(runRelease(f.input, f.io, f.path), /without a successful receipt/);
  }
});

test('receipt retries skip builds and npm staging while approval is pending', async (t) => {
  const f = await fixture(t, {
    evidence: async () => [expected, { ...expected, state: 'staged' }],
  });
  const result = await runRelease(f.input, f.io, f.path);
  assert.equal(result.submit, 'false');
  assert.deepEqual(f.calls, []);
});

test('public npm retries compare saved integrity and never rebuild or resend', async (t) => {
  const f = await fixture(t, {
    evidence: async () => [expected],
    published: async () => ({ ...pkg, dist: { integrity } }),
  });
  assert.equal((await runRelease(f.input, f.io, f.path)).submit, 'false');
  assert.deepEqual(f.calls, []);
  f.io.published = async () => ({ ...pkg, dist: { integrity: 'different' } });
  await assert.rejects(runRelease(f.input, f.io, f.path), /mismatch/);
  f.io.evidence = async () => [];
  await assert.rejects(runRelease(f.input, f.io, f.path), /Missing evidence/);
});

test('missing, expired, malformed and conflicting evidence stop retries', async (t) => {
  const f = await fixture(t, { submissionStarted: async () => true });
  await assert.rejects(runRelease(f.input, f.io, f.path), /without a successful receipt/);
  for (const value of [
    null,
    { ...expected, sha: 'b'.repeat(40) },
    { ...expected, integrity: 'bad' },
    { ...expected, state: 'absent' },
  ]) {
    f.io.evidence = async () => [value as Evidence];
    await assert.rejects(runRelease(f.input, f.io, f.path));
  }
  f.io.evidence = async () => {
    throw new Error('expired');
  };
  await assert.rejects(runRelease(f.input, f.io, f.path), /expired/);
  f.io.evidence = async () => [
    expected,
    { ...expected, integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` },
  ];
  await assert.rejects(runRelease(f.input, f.io, f.path), /Conflicting/);
  assert.deepEqual(f.calls, []);
});

test('drafts, prereleases, moved tags, wrong version and lookup failures stop before staging', async (t) => {
  const f = await fixture(t);
  for (const value of [
    { ...release, draft: true },
    { ...release, prerelease: true },
    { ...release, tag_name: 'v1.2.4' },
  ]) {
    f.io.release = async () => value;
    await assert.rejects(runRelease(f.input, f.io, f.path));
  }
  f.io.release = async () => release;
  f.io.tagSha = async () => 'b'.repeat(40);
  await assert.rejects(runRelease(f.input, f.io, f.path), /changed/);
  f.io.tagSha = async () => sha;
  await assert.rejects(runRelease({ ...f.input, tag: 'v1.2.4' }, f.io, f.path), /version differ/);
  f.io.published = async () => {
    throw new Error('npm forbidden');
  };
  await assert.rejects(runRelease(f.input, f.io, f.path), /forbidden/);
  assert.deepEqual(f.calls, []);
});

test('tag and registry are checked again before sending the prepared tarball', async (t) => {
  const f = await fixture(t);
  await runRelease(f.input, f.io, f.path);
  f.io.evidence = async () => [expected];
  f.io.tagSha = async () => 'b'.repeat(40);
  await assert.rejects(submit(f.input, f.io, f.path, '/package.tgz'), /changed/);
  f.io.tagSha = async () => sha;
  f.io.published = async () => pkg;
  await assert.rejects(submit(f.input, f.io, f.path, '/package.tgz'), /registry state changed/);
  assert.ok(!f.calls.includes('stage'));
});

test('cleanup cannot change consumer fields, leave dev metadata, or use local cleanup for other packages', async (t) => {
  const f = await fixture(t);
  const pack = f.io.pack;
  f.io.pack = async (cwd) => ({
    ...(await pack(cwd)),
    pkg: { ...pkg, devDependencies: undefined, exports: {} },
  });
  await assert.rejects(runRelease(f.input, f.io, f.path), /consumer field/);
  f.io.pack = async (cwd) => ({ ...(await pack(cwd)), pkg });
  await assert.rejects(runRelease(f.input, f.io, f.path), /development metadata/);
  await assert.rejects(runRelease({ ...f.input, cleanup: 'local' }, f.io, f.path), /Local cleanup/);
});

test('publishing input policy rejects old operations, arbitrary tags and publishing events', () => {
  const base = { cwd: '.', action: 'stage', tag, sha, repository, event: 'release' };
  for (const change of [
    { action: 'finalize' },
    { event: 'push' },
    { event: 'pull_request' },
    { tag: 'v1.2.3-beta' },
    { tag: 'v1.2.3\n' },
    { sha: 'main' },
    { repository: 'example/widget\n' },
  ])
    assert.throws(() => validateInputs({ ...base, ...change }));
});

test('a failed build can be retried or manually dispatched before submission', async (t) => {
  const f = await fixture(t, {
    prepare: async () => {
      throw new Error('flaky build');
    },
  });
  await assert.rejects(runRelease(f.input, f.io, f.path), /flaky build/);
  f.io.prepare = async () => {
    f.calls.push('prepare');
  };
  const retry = { ...f.input, event: 'workflow_dispatch' };
  assert.equal((await runRelease(retry, f.io, f.path)).submit, 'true');
  f.io.evidence = async () => [expected];
  await submit(retry, f.io, f.path, '/package.tgz');
});

test('an uploaded preparation artifact without a started submission can be rebuilt safely', async (t) => {
  const f = await fixture(t, { evidence: async () => [expected] });
  assert.equal((await runRelease(f.input, f.io, f.path)).submit, 'true');
  assert.ok(f.calls.includes('prepare'));
  f.io.submissionStarted = async () => true;
  await assert.rejects(runRelease(f.input, f.io, f.path), /without a successful receipt/);
});

test('manual publishing resolves only the selected Release commit for accurate provenance', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    runRelease({ ...f.input, event: 'workflow_dispatch', sha: 'b'.repeat(40) }, f.io, f.path),
    /source tag changed/,
  );
  assert.equal(
    (await runRelease({ ...f.input, event: 'workflow_dispatch' }, f.io, f.path)).submit,
    'true',
  );
});
