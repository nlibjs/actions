import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import test from 'node:test';
import {
  changelogNotes,
  selectRelease,
  validateInputs,
} from '../actions/npm-release/src/policy.ts';
import { runRelease } from '../actions/npm-release/src/release.ts';
import { createRuntime } from '../actions/npm-release/src/runtime.ts';
import type {
  PackageMetadata,
  RawInputs,
  Release,
  Runtime,
} from '../actions/npm-release/src/types.ts';

const sha = 'a'.repeat(40);
const repository = 'example/widget';
const pkg: PackageMetadata = {
  name: '@example/widget',
  version: '1.2.3',
  repository: `https://github.com/${repository}`,
  publishConfig: { access: 'public' },
  exports: { '.': './index.js' },
  types: './index.d.ts',
  sideEffects: false,
  devDependencies: { tool: '1.0.0' },
  renovate: {},
};
const input: RawInputs = {
  cwd: process.cwd(),
  action: 'stage',
  version: '',
  cleanup: 'registry',
  repository,
  sha,
  ref: 'refs/heads/main',
  event: 'push',
};
const integrity = 'sha512-test';
const draft: Release = {
  id: 1,
  tag_name: 'v1.2.3',
  target_commitish: sha,
  draft: true,
  html_url: 'https://github.com/example/widget/releases/1',
  assets: [
    { id: 10, name: 'package.tgz', state: 'uploaded' },
    { id: 11, name: 'package.integrity', state: 'uploaded' },
  ],
};
const cleaned: PackageMetadata = {
  name: pkg.name,
  version: pkg.version,
  ...Object.fromEntries(
    Object.entries(pkg).filter(([k]) => !['devDependencies', 'renovate'].includes(k)),
  ),
};

async function fixture(t: TestContext, overrides: Partial<Runtime> = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'release-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'package.json'), JSON.stringify(pkg));
  await writeFile(
    join(cwd, 'CHANGELOG.md'),
    '# Changelog\n\n## v1.2.3 (2026-10-12)\n\nUseful change.\n\n## v1.2.2 (2026-01-01)\n\nOlder.\n',
  );
  const calls: string[] = [],
    summaries: string[] = [];
  let releaseList: Release[] = [];
  const io: Runtime = {
    releases: async () => releaseList,
    published: async () => null,
    tagSha: async () => null,
    prepare: async () => {
      calls.push('prepare');
    },
    cleanup: async () => {
      calls.push('cleanup');
    },
    pack: async () => ({
      pkg: cleaned,
      integrity,
      tarball: '/saved/package.tgz',
      files: ['package/package.json'],
    }),
    createDraft: async (_tag, _sha, body) => {
      calls.push('draft');
      const created = { ...draft, body };
      releaseList = [created];
      return created;
    },
    upload: async () => {
      calls.push('tarball');
    },
    uploadText: async () => {
      calls.push('integrity');
    },
    download: async () => '/saved/package.tgz',
    downloadText: async () => `${integrity}\n`,
    inspectTarball: async () => ({ pkg: cleaned, integrity, files: ['package/package.json'] }),
    stage: async () => {
      calls.push('stage');
      return { code: 0, stdout: 'unrecognised successful output' };
    },
    updateBody: async () => {
      calls.push('receipt');
    },
    publishDraft: async (release) => {
      calls.push('publish');
      return { ...release, draft: false };
    },
    summary: (message) => summaries.push(message),
    ...overrides,
  };
  return { input: { ...input, cwd }, io, calls, summaries };
}

test('legacy published version and tag are a successful no-op after a dependency-only change', async (t) => {
  const f = await fixture(t, {
    published: async () => cleaned,
    tagSha: async () => 'b'.repeat(40),
  });
  const result = await runRelease(f.input, f.io);
  assert.equal(result['npm-state'], 'published');
  assert.equal(result['jsr-ready'], 'false');
  assert.deepEqual(f.calls, []);
  assert.match(f.summaries[0] || '', /No-op/);
});

for (const [name, overrides] of [
  ['tag without npm', { tagSha: async () => sha }],
  ['npm without tag', { published: async () => cleaned }],
  ['duplicate drafts', { releases: async () => [draft, { ...draft, id: 2 }] }],
  [
    'registry outage',
    {
      published: async () => {
        throw new Error('outage');
      },
    },
  ],
] satisfies [string, Partial<Runtime>][]) {
  test(`${name} cannot trigger a new stage`, async (t) => {
    const f = await fixture(t, overrides);
    await assert.rejects(runRelease(f.input, f.io));
    assert.deepEqual(f.calls, []);
  });
}

test('exit 0 is success even without a parseable stage ID; assets precede staging', async (t) => {
  const f = await fixture(t);
  const result = await runRelease(f.input, f.io);
  assert.equal(result['npm-state'], 'staged');
  assert.deepEqual(f.calls, [
    'prepare',
    'cleanup',
    'draft',
    'tarball',
    'integrity',
    'stage',
    'receipt',
  ]);
  assert.match(f.summaries.join('\n'), /Stage ID was not extracted/);
});

test('nonzero staging preserves the draft and never finalizes', async (t) => {
  const f = await fixture(t, { stage: async () => ({ code: 1, stdout: '' }) });
  await assert.rejects(runRelease(f.input, f.io), /unknown/);
  assert.ok(f.calls.includes('draft'));
  assert.ok(!f.calls.includes('publish'));
});

test('successful npm stage followed by receipt failure remains visibly successful on npm', async (t) => {
  const f = await fixture(t, {
    updateBody: async () => {
      throw new Error('GitHub receipt failure');
    },
  });
  await assert.rejects(runRelease(f.input, f.io), /receipt failure/);
  assert.match(f.summaries.join('\n'), /npm staging succeeded/);
  await assert.rejects(runRelease(f.input, f.io), /unknown/);
  assert.equal(f.calls.filter((c) => c === 'stage').length, 1);
});

test('an existing draft is never sent again', async (t) => {
  const f = await fixture(t, {
    releases: async () => [{ ...draft, body: '\n\nStaging succeeded.' }],
  });
  const result = await runRelease(f.input, f.io);
  assert.equal(result['source-sha'], sha);
  assert.deepEqual(f.calls, []);
});

test('an unconfirmed draft fails retries without resending', async (t) => {
  const f = await fixture(t, { releases: async () => [draft] });
  await assert.rejects(runRelease(f.input, f.io), /unknown/);
  assert.deepEqual(f.calls, []);
});

test('missing draft asset stops a retry', async (t) => {
  const f = await fixture(t, { releases: async () => [{ ...draft, assets: [] }] });
  await assert.rejects(runRelease(f.input, f.io), /missing assets/);
  assert.deepEqual(f.calls, []);
});

test('asset upload failure stops before the registry is written', async (t) => {
  const f = await fixture(t, {
    uploadText: async () => {
      throw new Error('asset upload failed');
    },
  });
  await assert.rejects(runRelease(f.input, f.io), /asset upload failed/);
  assert.ok(!f.calls.includes('stage'));
});

test('published integrity mismatch in an existing draft is not a successful no-op', async (t) => {
  const f = await fixture(t, {
    releases: async () => [draft],
    published: async () => ({ ...cleaned, dist: { integrity: 'sha512-wrong' } }),
  });
  await assert.rejects(runRelease(f.input, f.io), /integrity differs/);
  assert.deepEqual(f.calls, []);
});

test('finalize publishes from saved SHA, letting GitHub create the absent tag', async (t) => {
  let published = false;
  const f = await fixture(t, {
    releases: async () => [draft],
    published: async () => ({ ...cleaned, dist: { integrity } }),
    tagSha: async () => (published ? sha : null),
    publishDraft: async (release) => {
      published = true;
      return { ...release, draft: false };
    },
  });
  const result = await runRelease(
    { ...f.input, action: 'finalize', version: '1.2.3', sha: 'b'.repeat(40) },
    f.io,
  );
  assert.equal(result['source-sha'], sha);
  assert.equal(result['jsr-ready'], 'true');
  assert.deepEqual(f.calls, []);
});

test('already finalized release enables the JSR retry without npm staging', async (t) => {
  const f = await fixture(t, {
    releases: async () => [{ ...draft, draft: false }],
    published: async () => ({ ...cleaned, dist: { integrity } }),
    tagSha: async () => sha,
  });
  assert.equal(
    (await runRelease({ ...f.input, action: 'finalize', version: '1.2.3' }, f.io))['jsr-ready'],
    'true',
  );
  assert.deepEqual(f.calls, []);
});

for (const [name, overrides] of [
  ['pending npm', {}],
  [
    'wrong integrity',
    { published: async () => ({ ...cleaned, dist: { integrity: 'sha512-other' } }) },
  ],
  [
    'wrong tag SHA',
    {
      published: async () => ({ ...cleaned, dist: { integrity } }),
      tagSha: async () => 'b'.repeat(40),
    },
  ],
  ['branch-name target', { releases: async () => [{ ...draft, target_commitish: 'main' }] }],
] satisfies [string, Partial<Runtime>][]) {
  test(`finalize rejects ${name}`, async (t) => {
    const f = await fixture(t, { releases: async () => [draft], ...overrides });
    await assert.rejects(runRelease({ ...f.input, action: 'finalize', version: '1.2.3' }, f.io));
    assert.ok(!f.calls.includes('publish'));
  });
}

test('verify never reads or mutates release state', async (t) => {
  const f = await fixture(t, {
    releases: async () => {
      throw new Error('verify must not call GitHub');
    },
  });
  await runRelease({ ...f.input, action: 'verify' }, f.io);
  assert.deepEqual(f.calls, ['prepare', 'cleanup']);
});

test('invalid input and shell payloads are rejected before any side effects', () => {
  for (const version of ['1.2.3-beta.0', '01.2.3', '1.2.3; echo secret', '$(whoami)', '1.2.3\n']) {
    assert.throws(() => validateInputs({ ...input, action: 'finalize', version }));
  }
  assert.throws(() =>
    validateInputs({ ...input, ref: 'refs/pull/1/merge', event: 'pull_request' }),
  );
  assert.throws(() => validateInputs({ ...input, action: 'invalid' }));
  assert.throws(() => selectRelease([draft, draft], 'v1.2.3'));
  assert.throws(() => changelogNotes('## v1.2.3 (today)\n\n## v1.2.2 (yesterday)', 'v1.2.3'));
});

test('real registry cleanup and tarball inspection retain consumer fields', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.input.cwd, 'index.js'), 'export default 1;');
  await writeFile(join(f.input.cwd, 'index.d.ts'), 'declare const n: number; export default n;');
  const io = await createRuntime({ repository, actionPath: resolve('actions/npm-release') });
  await io.cleanup(f.input.cwd, 'registry');
  const cleanedFile = JSON.parse(await readFile(join(f.input.cwd, 'package.json'), 'utf8'));
  assert.equal(cleanedFile.devDependencies, undefined);
  assert.equal(cleanedFile.renovate, undefined);
  assert.deepEqual(cleanedFile.exports, pkg.exports);
  assert.equal(cleanedFile.types, pkg.types);
  assert.equal(cleanedFile.sideEffects, false);
  const packed = await io.pack(f.input.cwd);
  assert.match(packed.integrity, /^sha512-/);
  assert.deepEqual(packed.pkg.exports, pkg.exports);
  assert.ok(packed.files.includes('package/index.js'));
});

test('GitHub adapter paginates draft search and resolves annotated tags', async () => {
  const seen: string[] = [];
  const fetcher: typeof fetch = async (request) => {
    const url = String(request);
    seen.push(url);
    if (new URL(url).searchParams.get('page') === '1')
      return Response.json(
        Array.from({ length: 100 }, (_, id) => ({ ...draft, id, tag_name: `v0.0.${id}` })),
      );
    if (new URL(url).searchParams.get('page') === '2') return Response.json([draft]);
    if (url.includes('/git/ref/'))
      return Response.json({ object: { type: 'tag', sha: 'b'.repeat(40) } });
    if (url.includes('/git/tags/')) return Response.json({ object: { type: 'commit', sha } });
    throw new Error('Unexpected request');
  };
  const io = await createRuntime({ repository, fetcher });
  const selected = selectRelease(await io.releases(), 'v1.2.3');
  assert.ok(selected);
  assert.equal(selected.id, draft.id);
  assert.equal(await io.tagSha('v1.2.3'), sha);
  assert.equal(seen.length, 4);
});

test('permission 403 from GitHub is not treated as missing release', async () => {
  const io = await createRuntime({
    repository,
    fetcher: async () => new Response('', { status: 403 }),
  });
  await assert.rejects(io.releases(), /permissions/);
});
