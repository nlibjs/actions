import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REGISTRY, SHA } from './policy.mjs';

export async function command(program, args, options = {}) {
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
}) {
  const work = await mkdtemp(join(env.RUNNER_TEMP || tmpdir(), 'nlib-release-'));
  env = { ...env, npm_config_cache: join(work, 'npm-cache') };
  const npmRun = (args, cwd, log = false) =>
    command(npm[0], [...npm.slice(1), ...args], { cwd, log, env });
  const must = async (program, args, options) => {
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
  const request = async (url, init = {}, allow404 = false) => {
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
  const jsonRequest = async (url, init, allow404) => {
    const response = await request(url, init, allow404);
    return response ? response.json() : null;
  };
  const mutate = (url, method, payload) =>
    jsonRequest(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  const io = {
    async releases() {
      const releases = [];
      for (let page = 1; ; page++) {
        const batch = await jsonRequest(`${apiBase}/releases?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new Error('Unexpected release list');
        releases.push(...batch);
        if (batch.length < 100) return releases;
        if (page >= 1000) throw new Error('Release pagination limit exceeded');
      }
    },
    async tagSha(tag) {
      const ref = await jsonRequest(
        `${apiBase}/git/ref/tags/${encodeURIComponent(tag)}`,
        undefined,
        true,
      );
      if (!ref) return null;
      let object = ref.object;
      for (let depth = 0; depth < 20; depth++) {
        if (object?.type === 'commit' && SHA.test(object.sha)) return object.sha;
        if (object?.type !== 'tag' || !SHA.test(object.sha)) throw new Error('Invalid tag object');
        object = (await jsonRequest(`${apiBase}/git/tags/${object.sha}`)).object;
      }
      throw new Error('Too many nested annotated tags');
    },
    async published(name, version) {
      const result = await npmRun(
        ['view', `${name}@${version}`, '--json', `--registry=${REGISTRY}`],
        work,
      );
      if (result.code !== 0) {
        let error;
        try {
          error = JSON.parse(result.stdout).error;
        } catch {}
        if (error?.code === 'E404') return null;
        throw new Error(`npm view failed (exit ${result.code}); not treated as unpublished`);
      }
      const value = JSON.parse(result.stdout);
      if (value.name !== name || value.version !== version)
        throw new Error('Unexpected npm version response');
      return value;
    },
    async prepare(cwd) {
      const version = await npmRun(['--version'], cwd);
      if (version.code !== 0 || version.stdout.trim() !== '11.21.0')
        throw new Error('Expected npm 11.21.0');
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
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
      const cli =
        source === 'local'
          ? join(cwd, 'esm/cli.mjs')
          : join(actionPath, 'node_modules/@nlib/cleanup-package-json/esm/cli.mjs');
      await must(process.execPath, [cli, '--file', join(cwd, 'package.json')]);
    },
    async pack(cwd) {
      const result = await npmRun(['pack', '--json', '--pack-destination', work], cwd);
      if (result.code !== 0)
        throw new Error(`npm pack failed (exit ${result.code}): ${result.stderr.slice(-4000)}`);
      const metadata = JSON.parse(result.stdout);
      if (metadata.length !== 1 || !/^[\w.-]+\.tgz$/.test(metadata[0].filename))
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
      const pkg = JSON.parse(await must('tar', ['-xOf', tarball, 'package/package.json']));
      return { pkg, integrity, files };
    },
    createDraft(tag, sha, body) {
      return mutate(`${apiBase}/releases`, 'POST', {
        tag_name: tag,
        target_commitish: sha,
        name: tag,
        body,
        draft: true,
        prerelease: false,
      });
    },
    async upload(release, name, path) {
      const endpoint = release.upload_url.replace(/\{.*$/, '');
      return jsonRequest(`${endpoint}?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: await readFile(path),
      });
    },
    async uploadText(release, name, text) {
      const path = join(work, name);
      await writeFile(path, text);
      return io.upload(release, name, path);
    },
    async download(asset) {
      const response = await request(asset.url, {
        headers: { Accept: 'application/octet-stream' },
      });
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
    updateBody(release, body) {
      return mutate(`${apiBase}/releases/${release.id}`, 'PATCH', { body });
    },
    publishDraft(release) {
      return mutate(`${apiBase}/releases/${release.id}`, 'PATCH', {
        draft: false,
        target_commitish: release.target_commitish,
      });
    },
    summary(message) {
      console.log(message);
      if (env.GITHUB_STEP_SUMMARY) {
        // Serialise writes in the caller to avoid mixing multiple summaries.
        io.pendingSummary = (io.pendingSummary || Promise.resolve()).then(() =>
          appendFile(env.GITHUB_STEP_SUMMARY, `${message}\n\n`),
        );
      }
    },
  };
  return io;
}
