import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { githubRelease, gitObject, isRecord, packageMetadata, record } from './json.ts';
import { REGISTRY, SHA } from './policy.ts';
import type { CommandResult, Release, Runtime } from './types.ts';

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  log?: boolean;
}
interface RuntimeOptions {
  repository: string;
  actionPath?: string;
  npm?: [string, ...string[]];
  fetcher?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

export async function command(
  program: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult & { stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (options.log) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (options.log) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

export async function createRuntime({
  repository,
  actionPath,
  npm = ['npm'],
  fetcher = fetch,
  env = process.env,
}: RuntimeOptions): Promise<Runtime> {
  const work = await mkdtemp(join(env.RUNNER_TEMP || tmpdir(), 'nlib-release-'));
  env = { ...env, npm_config_cache: join(work, 'npm-cache') };
  const npmRun = (args: string[], cwd: string, log = false) =>
    command(npm[0], [...npm.slice(1), ...args], { cwd, log, env });
  const must = async (program: string, args: string[], options: CommandOptions = {}) => {
    const result = await command(program, args, { env, ...options });
    if (result.code !== 0)
      throw new Error(`${program} failed (exit ${result.code}): ${result.stderr.slice(-4000)}`);
    return result.stdout;
  };
  const apiBase = `https://api.github.com/repos/${repository}`;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const request = async (url: string, init: RequestInit = {}, allow404 = false) => {
    const parsed = new URL(url);
    if (
      !['api.github.com', 'uploads.github.com'].includes(parsed.hostname) ||
      !parsed.pathname.startsWith(`/repos/${repository}/`)
    )
      throw new Error('Unexpected GitHub API destination');
    const response = await fetcher(url, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status === 404 && allow404) return null;
    if (!response.ok)
      throw new Error(
        `GitHub ${init.method || 'GET'} ${parsed.pathname} failed (${response.status}). Check permissions and target workflow changes; not treated as absence.`,
      );
    return response;
  };
  const jsonRequest = async (
    url: string,
    init?: RequestInit,
    allow404 = false,
  ): Promise<unknown> => {
    const response = await request(url, init, allow404);
    return response ? response.json() : null;
  };
  const mutate = (url: string, method: string, payload: Record<string, unknown>) =>
    jsonRequest(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  const updateRelease = async (release: Release, changes: { body?: string; draft?: boolean }) => {
    // GitHub can replace an uncreated draft tag with `untagged-*` when a PATCH omits it.
    const updated = githubRelease(
      await mutate(`${apiBase}/releases/${release.id}`, 'PATCH', {
        ...changes,
        tag_name: release.tag_name,
        target_commitish: release.target_commitish,
      }),
    );
    if (
      updated.id !== release.id ||
      updated.tag_name !== release.tag_name ||
      updated.target_commitish !== release.target_commitish ||
      updated.draft !== (changes.draft ?? release.draft)
    )
      throw new Error('GitHub Release update changed the saved identity or publication state');
    return updated;
  };

  const io: Runtime = {
    async releases() {
      const releases: Release[] = [];
      for (let page = 1; ; page++) {
        const batch = await jsonRequest(`${apiBase}/releases?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new Error('Unexpected release list');
        releases.push(...batch.map(githubRelease));
        if (batch.length < 100) return releases;
        if (page >= 1000) throw new Error('Release pagination limit exceeded');
      }
    },
    async tagSha(tag) {
      const response = await request(
        `${apiBase}/git/ref/tags/${encodeURIComponent(tag)}`,
        undefined,
        true,
      );
      if (!response) return null;
      let object = gitObject(await response.json());
      for (let depth = 0; depth < 20; depth++) {
        if (object?.type === 'commit' && SHA.test(object.sha)) return object.sha;
        if (object?.type !== 'tag' || !SHA.test(object.sha)) throw new Error('Invalid tag object');
        object = gitObject(await jsonRequest(`${apiBase}/git/tags/${object.sha}`));
      }
      throw new Error('Too many nested annotated tags');
    },
    async published(name, version) {
      const result = await npmRun(
        ['view', `${name}@${version}`, '--json', `--registry=${REGISTRY}`],
        work,
      );
      if (result.code !== 0) {
        let error: unknown;
        try {
          error = record(JSON.parse(result.stdout), 'npm error').error;
        } catch {}
        if (isRecord(error) && error.code === 'E404') return null;
        throw new Error(`npm view failed (exit ${result.code}); not treated as unpublished`);
      }
      const value = packageMetadata(JSON.parse(result.stdout));
      if (value.name !== name || value.version !== version)
        throw new Error('Unexpected npm version response');
      return value;
    },
    async prepare(cwd) {
      const version = await npmRun(['--version'], cwd);
      if (version.code !== 0 || version.stdout.trim() !== '11.21.0')
        throw new Error('Expected npm 11.21.0');
      const pkg = packageMetadata(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')));
      for (const args of [
        ['ci'],
        ['run', 'lint'],
        ['test'],
        ['run', pkg.scripts?.['release:prepare'] ? 'release:prepare' : 'build'],
      ]) {
        const result = await npmRun(args, cwd, true);
        if (result.code !== 0)
          throw new Error(`npm ${args.join(' ')} failed (exit ${result.code})`);
      }
    },
    async cleanup(cwd, source) {
      if (source === 'registry' && !actionPath) throw new Error('Missing helper action path');
      const cli =
        source === 'local'
          ? join(cwd, 'esm/cli.mjs')
          : join(actionPath || '', 'node_modules/@nlib/cleanup-package-json/esm/cli.mjs');
      await must(process.execPath, [cli, '--file', join(cwd, 'package.json')]);
    },
    async pack(cwd) {
      const result = await npmRun(['pack', '--json', '--pack-destination', work], cwd);
      if (result.code !== 0)
        throw new Error(`npm pack failed (exit ${result.code}): ${result.stderr.slice(-4000)}`);
      const metadata: unknown = JSON.parse(result.stdout);
      if (
        !Array.isArray(metadata) ||
        metadata.length !== 1 ||
        !isRecord(metadata[0]) ||
        typeof metadata[0].filename !== 'string' ||
        !/^[\w.-]+\.tgz$/.test(metadata[0].filename)
      )
        throw new Error('Expected one package tarball');
      const tarball = join(work, metadata[0].filename);
      const inspected = await io.inspectTarball(tarball);
      return { tarball, ...inspected };
    },
    async inspectTarball(tarball) {
      const bytes = await readFile(tarball);
      if (bytes.length > 64 * 1024 * 1024) throw new Error('Package tarball exceeds 64 MiB');
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
      const files = (await must('tar', ['-tzf', tarball])).trim().split('\n');
      if (
        files.filter((f) => f === 'package/package.json').length !== 1 ||
        files.some((f) => !f.startsWith('package/') || f.split('/').includes('..'))
      )
        throw new Error('Invalid npm tarball paths');
      const pkg = packageMetadata(
        JSON.parse(await must('tar', ['-xOf', tarball, 'package/package.json'])),
      );
      return { pkg, integrity, files };
    },
    async createDraft(tag, sha, body) {
      return githubRelease(
        await mutate(`${apiBase}/releases`, 'POST', {
          tag_name: tag,
          target_commitish: sha,
          name: tag,
          body,
          draft: true,
          prerelease: false,
        }),
      );
    },
    async upload(release, name, path) {
      if (!release.upload_url) throw new Error('Missing Release upload URL');
      const endpoint = release.upload_url.replace(/\{.*$/, '');
      await jsonRequest(`${endpoint}?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(await readFile(path)),
      });
    },
    async uploadText(release, name, text) {
      const path = join(work, name);
      await writeFile(path, text);
      return io.upload(release, name, path);
    },
    async download(asset) {
      if (!asset.url) throw new Error('Missing asset URL');
      const response = await request(asset.url, {
        headers: { Accept: 'application/octet-stream' },
      });
      if (!response) throw new Error('Missing asset response');
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 64 * 1024 * 1024) throw new Error('Release asset exceeds 64 MiB');
      const path = join(work, `asset-${asset.id}.tgz`);
      await writeFile(path, data);
      return path;
    },
    async downloadText(asset) {
      return readFile(await io.download(asset), 'utf8');
    },
    async stage(tarball) {
      // The package-spec is the saved tarball. A temporary cwd avoids caller .npmrc redirects.
      return npmRun(
        [
          'stage',
          'publish',
          tarball,
          '--json',
          '--provenance',
          '--access=public',
          `--registry=${REGISTRY}`,
          '--ignore-scripts',
        ],
        work,
      );
    },
    async updateBody(release, body) {
      await updateRelease(release, { body });
    },
    async publishDraft(release) {
      return updateRelease(release, { draft: false });
    },
    summary(message) {
      console.log(message);
      const summaryPath = env.GITHUB_STEP_SUMMARY;
      if (summaryPath) {
        // Serialise writes in the caller to avoid mixing multiple summaries.
        io.pendingSummary = (io.pendingSummary || Promise.resolve()).then(() =>
          appendFile(summaryPath, `${message}\n\n`),
        );
      }
    },
  };
  return io;
}
