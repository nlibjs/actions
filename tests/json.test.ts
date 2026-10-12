import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { githubRelease, packageMetadata } from '../actions/npm-release/src/json.ts';
import { optionalStageId, validateManifest } from '../actions/npm-release/src/policy.ts';
import { command, createRuntime } from '../actions/npm-release/src/runtime.ts';

const repository = 'example/widget';
const pkg = {
  name: '@example/widget',
  version: '1.2.3',
  repository: `https://github.com/${repository}`,
};
const release = {
  id: 1,
  tag_name: 'v1.2.3',
  target_commitish: 'a'.repeat(40),
  draft: true,
  html_url: `https://github.com/${repository}/releases/1`,
  assets: [{ id: 10, name: 'package.tgz', state: 'uploaded' }],
};

test('untrusted package JSON is checked before applying release policy', () => {
  for (const value of [
    null,
    [],
    1,
    { ...pkg, name: 1 },
    { ...pkg, version: null },
    { ...pkg, repository: { url: 1 } },
    { ...pkg, publishConfig: { registry: 1 } },
    { ...pkg, scripts: { build: false } },
    { ...pkg, dist: { integrity: [] } },
  ]) {
    assert.throws(() => validateManifest(value, repository), /Invalid/);
  }
  for (const value of [
    { ...pkg, private: true },
    { ...pkg, workspaces: ['packages/*'] },
    { ...pkg, version: '1.2.3-beta.0' },
    { ...pkg, repository: 'https://github.com/other/package' },
    { ...pkg, publishConfig: { registry: 'https://example.com' } },
    { ...pkg, publishConfig: { tag: 'next' } },
    { ...pkg, publishConfig: { access: 'restricted' } },
  ]) {
    assert.throws(() => validateManifest(value, repository));
  }
});

test('metadata decoding preserves consumer fields and extra publish settings', () => {
  const fields = {
    ...pkg,
    exports: { '.': './index.js' },
    sideEffects: false,
    publishConfig: { access: 'public', provenance: true },
    custom: { nested: ['value'] },
  };
  const decoded = validateManifest(fields, repository);
  assert.deepEqual(decoded.exports, fields.exports);
  assert.deepEqual(decoded.custom, fields.custom);
  assert.equal(JSON.stringify(decoded.publishConfig), JSON.stringify(fields.publishConfig));
});

test('untrusted Release and asset fields must have the expected shapes', () => {
  for (const value of [
    null,
    [],
    { ...release, id: '1' },
    { ...release, draft: 'false' },
    { ...release, target_commitish: 1 },
    { ...release, html_url: null },
    { ...release, assets: {} },
    { ...release, assets: [{ id: 10, name: 'package.tgz' }] },
    { ...release, body: [] },
    { ...release, upload_url: 1 },
  ]) {
    assert.throws(() => githubRelease(value), /Invalid/);
  }
  assert.equal(githubRelease({ ...release, body: null }).body, null);
});

test('stage IDs remain optional diagnostics for unfamiliar and malformed JSON', () => {
  assert.equal(optionalStageId('{"stageId":"abc-123"}'), 'abc-123');
  assert.equal(optionalStageId('[{"stageId":"abc-123"}]'), 'abc-123');
  assert.equal(optionalStageId('{"package":{"stageId":"abc-123"}}'), 'abc-123');
  for (const text of [
    'null',
    '[]',
    'not JSON',
    '{"stageId":123}',
    '{"stageId":"bad id"}',
    '{"stageId":{"stageId":"nested"}}',
  ])
    assert.equal(optionalStageId(text), '');
});

test('GitHub list, create and publish responses are validated at the adapter boundary', async () => {
  const io = await createRuntime({
    repository,
    fetcher: async () => Response.json({ ...release, draft: 'false' }),
  });
  await assert.rejects(io.releases(), /Unexpected release list/);
  await assert.rejects(io.createDraft('v1.2.3', release.target_commitish, 'notes'), /draft flag/);
  await assert.rejects(io.publishDraft(release), /draft flag/);
  const list = await createRuntime({
    repository,
    fetcher: async () => Response.json([{ ...release, assets: null }]),
  });
  await assert.rejects(list.releases(), /assets/);
});

test('GitHub tag responses reject malformed objects and distinguish explicit absence', async () => {
  for (const value of [
    null,
    {},
    { object: { type: 'blob', sha: release.target_commitish } },
    { object: { type: 'commit', sha: 1 } },
    { object: { type: 'commit', sha: 'main' } },
  ]) {
    const io = await createRuntime({ repository, fetcher: async () => Response.json(value) });
    await assert.rejects(io.tagSha('v1.2.3'));
  }
  const absent = await createRuntime({
    repository,
    fetcher: async () => new Response('', { status: 404 }),
  });
  assert.equal(await absent.tagSha('v1.2.3'), null);
  await assert.rejects(absent.releases(), /not treated as absence/);
});

test('npm JSON and pack filenames are checked before use', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'npm-response-fixture-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const script = join(cwd, 'npm-fixture.mjs');
  await writeFile(
    script,
    'process.stdout.write(process.env.FIXTURE_JSON); process.exitCode = Number(process.env.FIXTURE_CODE || 0);',
  );
  const runtime = (value: unknown, code = 0) =>
    createRuntime({
      repository,
      npm: [process.execPath, script],
      env: { ...process.env, FIXTURE_JSON: JSON.stringify(value), FIXTURE_CODE: String(code) },
    });
  const valid = await runtime(pkg);
  assert.deepEqual(await valid.published(pkg.name, pkg.version), packageMetadata(pkg));
  for (const value of [null, { ...pkg, name: 'other' }, { ...pkg, dist: { integrity: 1 } }]) {
    const io = await runtime(value);
    await assert.rejects(io.published(pkg.name, pkg.version));
  }
  const absent = await runtime({ error: { code: 'E404' } }, 1);
  assert.equal(await absent.published(pkg.name, pkg.version), null);
  const failure = await runtime({ error: { code: 'E403' } }, 1);
  await assert.rejects(failure.published(pkg.name, pkg.version), /not treated as unpublished/);
  for (const value of [null, [], [{}], [{ filename: '../escape.tgz' }], [{ filename: 1 }]]) {
    const io = await runtime(value);
    await assert.rejects(io.pack(cwd), /Expected one package tarball/);
  }
});

test('the TypeScript CLI runs directly on Node 26 and rejects invalid inputs before publishing', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'release-cli-fixture-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const outputs = join(cwd, 'outputs');
  await writeFile(outputs, '');
  const result = await command(process.execPath, [resolve('actions/npm-release/src/cli.ts')], {
    cwd,
    env: {
      ...process.env,
      RELEASE_ACTION: 'invalid',
      GITHUB_REPOSITORY: repository,
      GITHUB_OUTPUT: outputs,
    },
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid action/);
  assert.equal(await readFile(outputs, 'utf8'), '');
});
