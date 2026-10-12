import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sourceBranch } from '../actions/npm-release/src/policy.ts';
import { command, createRuntime } from '../actions/npm-release/src/runtime.ts';

const repository = 'example/widget';
const version = '1.2.3';
const sha = 'a'.repeat(40);
const branch = sourceBranch(version);
const ref = `refs/heads/${branch}`;
const reference = (value = sha) => ({ ref, object: { type: 'commit', sha: value } });

test('source branches accept only stable versions', () => {
  assert.equal(branch, 'release-source/v1.2.3');
  for (const value of ['1.2.3-beta', '../main', '1.2.3\n'])
    assert.throws(() => sourceBranch(value));
});

test('retain creates the exact source ref and confirms its persisted SHA', async () => {
  let saved: ReturnType<typeof reference> | null = null;
  const methods: string[] = [];
  const io = await createRuntime({
    repository,
    fetcher: async (url, options) => {
      const method = options?.method || 'GET';
      methods.push(method);
      if (method === 'POST') {
        assert.equal(String(url), `https://api.github.com/repos/${repository}/git/refs`);
        assert.deepEqual(JSON.parse(String(options?.body)), { ref, sha });
        saved = reference();
        return Response.json(saved, { status: 201 });
      }
      assert.ok(String(url).endsWith(`/git/ref/heads/${branch}`));
      return saved ? Response.json(saved) : new Response('', { status: 404 });
    },
  });
  await io.retainSource(version, sha);
  assert.deepEqual(methods, ['GET', 'POST', 'GET']);
  await io.retainSource(version, sha);
  assert.deepEqual(methods, ['GET', 'POST', 'GET', 'GET']);
});

test('retain and cleanup reject an existing ref with another SHA without mutations', async () => {
  const io = await createRuntime({
    repository,
    fetcher: async (_url, options) => {
      assert.equal(options?.method || 'GET', 'GET');
      return Response.json(reference('b'.repeat(40)));
    },
  });
  await assert.rejects(io.retainSource(version, sha), /different SHA/);
  await assert.rejects(io.removeSource(version, sha), /different SHA/);
});

test('a concurrent creator is accepted only when the resulting source SHA matches', async () => {
  for (const concurrentSha of [sha, 'b'.repeat(40)]) {
    let created = false;
    const io = await createRuntime({
      repository,
      fetcher: async (_url, options) => {
        if (options?.method === 'POST') {
          created = true;
          return Response.json({ message: 'Reference already exists' }, { status: 422 });
        }
        return created
          ? Response.json(reference(concurrentSha))
          : new Response('', { status: 404 });
      },
    });
    if (concurrentSha === sha) await io.retainSource(version, sha);
    else await assert.rejects(io.retainSource(version, sha), /different SHA/);
  }
});

test('malformed references and denied reads fail rather than acting as absent', async () => {
  for (const value of [
    { ...reference(), ref: 'refs/heads/main' },
    { ref, object: { type: 'tag', sha } },
    reference('main'),
  ]) {
    const io = await createRuntime({ repository, fetcher: async () => Response.json(value) });
    await assert.rejects(io.retainSource(version, sha), /Invalid source reference/);
  }
  const denied = await createRuntime({
    repository,
    fetcher: async () => new Response('', { status: 403 }),
  });
  await assert.rejects(denied.retainSource(version, sha), /403/);
  await assert.rejects(denied.removeSource(version, sha), /403/);
});

test('a rejected source create stops without retrying writes', async () => {
  let posts = 0;
  const io = await createRuntime({
    repository,
    fetcher: async (_url, options) => {
      if (options?.method === 'POST') {
        posts++;
        return new Response('', { status: 403 });
      }
      return new Response('', { status: 404 });
    },
  });
  await assert.rejects(io.retainSource(version, sha), /403/);
  assert.equal(posts, 1);
});

test('cleanup is a no-op when the source branch is already absent', async () => {
  const io = await createRuntime({
    repository,
    fetcher: async () => new Response('', { status: 404 }),
  });
  await io.removeSource(version, sha);
});

for (const movedDuringDelete of [false, true]) {
  test(`real Git cleanup ${movedDuringDelete ? 'retains a concurrently moved branch' : 'deletes the matching branch and is retryable'}`, async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), 'source-ref-test-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const remote = join(cwd, 'remote.git');
    const git = async (args: string[]) => {
      const result = await command('git', args);
      assert.equal(result.code, 0, result.stderr);
      return result.stdout.trim();
    };
    await git(['init', '--bare', remote]);
    const tree = await git(['-C', remote, 'hash-object', '-t', 'tree', '--stdin']);
    const commit = (args: string[]) =>
      git([
        '-C',
        remote,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit-tree',
        tree,
        ...args,
      ]);
    const source = await commit(['-m', 'source']);
    const moved = await commit(['-p', source, '-m', 'moved']);
    await git(['-C', remote, 'update-ref', ref, source]);
    const shim = join(cwd, 'git-fixture.cjs');
    await writeFile(
      shim,
      `
      const {spawnSync} = require('node:child_process');
      const args = process.argv.slice(2);
      if (args.includes('push')) {
        if (process.env.REF_FIXTURE_MOVED_SHA) {
          const changed = spawnSync('git', ['-C', process.env.REF_FIXTURE_REMOTE, 'update-ref', '${ref}', process.env.REF_FIXTURE_MOVED_SHA]);
          if (changed.status !== 0) process.exit(1);
        }
        const target = args.indexOf('https://github.com/${repository}.git');
        if (target < 0) process.exit(1);
        args[target] = process.env.REF_FIXTURE_REMOTE;
      }
      const result = spawnSync('git', args, {stdio: 'inherit'});
      process.exit(result.status ?? 1);
    `,
    );
    const io = await createRuntime({
      repository,
      git: [process.execPath, shim],
      env: {
        ...process.env,
        GH_TOKEN: 'fixture-token',
        REF_FIXTURE_REMOTE: remote,
        REF_FIXTURE_MOVED_SHA: movedDuringDelete ? moved : '',
      },
      fetcher: async () => {
        const result = await command('git', ['-C', remote, 'show-ref', '--verify', '--hash', ref]);
        return result.code === 0
          ? Response.json(reference(result.stdout.trim()))
          : new Response('', { status: 404 });
      },
    });
    if (movedDuringDelete) {
      await assert.rejects(io.removeSource(version, source), /cleanup failed/);
      assert.equal(await git(['-C', remote, 'rev-parse', ref]), moved);
    } else {
      await io.removeSource(version, source);
      assert.notEqual((await command('git', ['-C', remote, 'show-ref', '--verify', ref])).code, 0);
      await io.removeSource(version, source);
    }
  });
}
