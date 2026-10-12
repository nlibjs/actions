import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { isRecord } from '../actions/npm-release/src/json.ts';
import { command, createRuntime } from '../actions/npm-release/src/runtime.ts';

test('npm 11.21.0 stage accepts a saved tarball without changing its integrity', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'npm-stage-fixture-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify({
      name: '@example/staging-fixture',
      version: '1.0.0',
      repository: 'https://github.com/example/staging-fixture',
      files: ['index.js'],
    }),
  );
  await writeFile(join(cwd, 'index.js'), 'module.exports = 1;');
  const env: NodeJS.ProcessEnv = { ...process.env, npm_config_cache: join(cwd, 'cache') };
  for (const key of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'NODE_AUTH_TOKEN',
    'NPM_TOKEN',
    'GITHUB_ACTIONS',
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    'ACTIONS_ID_TOKEN_REQUEST_URL',
  ])
    delete env[key];
  const version = await command('npm', ['--version'], { env });
  assert.equal(version.stdout.trim(), '11.21.0');
  const runtime = await createRuntime({
    repository: 'example/staging-fixture',
    actionPath: resolve('actions/npm-release'),
    env,
  });
  const packed = await runtime.pack(cwd);
  let writes = 0;
  const server = createServer((req, res) => {
    if (req.method !== 'GET') {
      writes++;
      res.writeHead(403);
      res.end('Fixture registry forbids writes');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ name: '@example/staging-fixture', versions: {}, 'dist-tags': {} }));
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const registry = `http://127.0.0.1:${address.port}`;
  const result = await command(
    'npm',
    [
      'stage',
      'publish',
      packed.tarball,
      '--dry-run',
      '--json',
      '--provenance',
      '--access=public',
      `--registry=${registry}`,
      '--ignore-scripts',
    ],
    { cwd, env },
  );
  assert.equal(result.code, 0, result.stderr);
  const metadata: unknown = JSON.parse(result.stdout);
  assert.ok(isRecord(metadata));
  const contents = metadata.integrity
    ? metadata
    : Object.values(metadata).find((v) => isRecord(v) && v.integrity);
  assert.ok(isRecord(contents));
  assert.equal(contents.integrity, packed.integrity);
  assert.equal(writes, 0, 'dry-run must never write to the registry');
});
