import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { command, createRuntime } from '../actions/npm-release/src/runtime.ts';

const repository = 'example/widget',
  sha = 'a'.repeat(40),
  tag = 'v1.2.3';
const run = {
  id: 10,
  event: 'release',
  head_branch: tag,
  head_sha: sha,
  path: '.github/workflows/release.yml',
};
const artifact = {
  id: 20,
  name: `npm-${tag}-10-1-prepared`,
  size_in_bytes: 100,
  expired: false,
  workflow_run: { id: 10 },
};

test('artifact restoration paginates, checks trusted origin, and reads only evidence.json', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'evidence-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const evidence = { integrity: 'expected', state: 'prepared' };
  await writeFile(join(dir, 'evidence.json'), JSON.stringify(evidence));
  const packed = await command('zip', ['-q', join(dir, 'evidence.zip'), 'evidence.json'], {
    cwd: dir,
  });
  assert.equal(packed.code, 0);
  const zip = await readFile(join(dir, 'evidence.zip'));
  const calls: string[] = [];
  const io = await createRuntime({
    repository,
    fetcher: async (url, init) => {
      assert.ok(!init?.method || init.method === 'GET');
      const path = new URL(String(url));
      calls.push(path.pathname);
      if (path.pathname.endsWith('/artifacts')) {
        return Response.json({
          artifacts:
            path.searchParams.get('page') === '1'
              ? Array.from({ length: 100 }, () => ({ name: 'unrelated' }))
              : [artifact],
        });
      }
      if (path.pathname.endsWith('/runs/10')) return Response.json(run);
      if (path.pathname.endsWith('/20/zip')) return new Response(zip);
      throw new Error('Unexpected API request');
    },
  });
  assert.deepEqual(await io.evidence(tag), [evidence]);
  assert.equal(calls.filter((p) => p.endsWith('/artifacts')).length, 2);
  // Extra entries cannot be extracted or treated as evidence.
  await writeFile(join(dir, 'extra.txt'), 'extra');
  assert.equal(
    (await command('zip', ['-q', join(dir, 'evidence.zip'), 'extra.txt'], { cwd: dir })).code,
    0,
  );
  const bad = await readFile(join(dir, 'evidence.zip'));
  const invalid = await createRuntime({
    repository,
    fetcher: async (url) => {
      const path = String(url);
      if (path.includes('/artifacts?')) return Response.json({ artifacts: [artifact] });
      if (path.endsWith('/runs/10')) return Response.json(run);
      return new Response(bad);
    },
  });
  await assert.rejects(invalid.evidence(tag), /Invalid evidence archive/);
});

test('PR and unrelated workflow artifacts are ignored; expired trusted artifacts fail closed', async () => {
  for (const origin of [
    { ...run, event: 'pull_request' },
    { ...run, path: '.github/workflows/test.yml' },
    run,
  ]) {
    const io = await createRuntime({
      repository,
      fetcher: async (url) =>
        String(url).includes('/artifacts?')
          ? Response.json({ artifacts: [{ ...artifact, expired: true }] })
          : Response.json(origin),
    });
    if (origin === run) await assert.rejects(io.evidence(tag), /expired/);
    else assert.deepEqual(await io.evidence(tag), []);
  }
});

test('only a prior started submission blocks preparation after missing evidence', async () => {
  for (const [status, conclusion, blocked] of [
    ['completed', 'success', true],
    ['completed', 'failure', true],
    ['in_progress', null, true],
    ['completed', 'skipped', false],
    ['queued', null, false],
  ] as const) {
    const io = await createRuntime({
      repository,
      env: { ...process.env, GITHUB_RUN_ID: '11', GITHUB_RUN_ATTEMPT: '2' },
      fetcher: async (url) => {
        if (String(url).includes('/workflows/release.yml/runs'))
          return Response.json({ workflow_runs: [{ ...run, event: 'workflow_dispatch' }] });
        return Response.json({
          jobs: [
            {
              name: `Stage / Stage ${tag}`,
              run_attempt: 1,
              steps: [{ name: 'Submit npm tarball', status, conclusion }],
            },
          ],
        });
      },
    });
    assert.equal(await io.submissionStarted(tag), blocked);
  }
  const io = await createRuntime({
    repository,
    env: { ...process.env, GITHUB_RUN_ID: '10', GITHUB_RUN_ATTEMPT: '2' },
    fetcher: async (url) =>
      String(url).includes('/workflows/')
        ? Response.json({ workflow_runs: [run] })
        : Response.json({
            jobs: [
              {
                name: `Stage ${tag}`,
                run_attempt: 2,
                steps: [{ name: 'Submit npm tarball', status: 'in_progress' }],
              },
              {
                name: 'Stage v1.2.4',
                run_attempt: 1,
                steps: [{ name: 'Submit npm tarball', status: 'completed' }],
              },
              {
                name: `Stage ${tag}`,
                run_attempt: 1,
                steps: [
                  { name: 'Prepare npm package', status: 'completed', conclusion: 'failure' },
                ],
              },
            ],
          }),
  });
  assert.equal(await io.submissionStarted(tag), false);
});

test('artifact lookup permission and network errors never become absence', async () => {
  for (const status of [403, 404, 500]) {
    const io = await createRuntime({
      repository,
      fetcher: async () => new Response('', { status }),
    });
    await assert.rejects(io.evidence(tag), /not treated as absence/);
  }
});
