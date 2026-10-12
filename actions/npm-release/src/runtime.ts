import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { githubRelease, gitObject, isRecord, packageMetadata, record } from './json.ts';
import { REGISTRY, SHA } from './policy.ts';
import type { CommandResult, Evidence, Runtime } from './types.ts';

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
      parsed.hostname !== 'api.github.com' ||
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
  const pages = async (path: string, field: string): Promise<Record<string, unknown>[]> => {
    const result: Record<string, unknown>[] = [];
    for (let page = 1; page <= 1000; page++) {
      const batch = record(
        await jsonRequest(
          `${apiBase}/${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
        ),
        field,
      )[field];
      if (!Array.isArray(batch)) throw new Error(`Invalid ${field} list`);
      result.push(...batch.map((v) => record(v, field)));
      if (batch.length < 100) return result;
    }
    throw new Error('Pagination limit exceeded');
  };
  const io: Runtime = {
    async release(tag) {
      return githubRelease(
        await jsonRequest(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`),
      );
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
        if (object.type === 'commit' && SHA.test(object.sha)) return object.sha;
        if (object.type !== 'tag' || !SHA.test(object.sha)) throw new Error('Invalid tag object');
        object = gitObject(await jsonRequest(`${apiBase}/git/tags/${object.sha}`));
      }
      throw new Error('Too many nested annotated tags');
    },
    async submissionStarted(tag) {
      const runs = await pages('actions/workflows/release.yml/runs', 'workflow_runs');
      for (const run of runs.filter((r) =>
        ['release', 'workflow_dispatch'].includes(String(r.event)),
      )) {
        const jobs = await pages(`actions/runs/${run.id}/jobs?filter=all`, 'jobs');
        for (const job of jobs) {
          if (
            String(run.id) === env.GITHUB_RUN_ID &&
            String(job.run_attempt) === env.GITHUB_RUN_ATTEMPT
          )
            continue;
          if (job.name !== `Stage ${tag}` && !String(job.name).endsWith(` / Stage ${tag}`))
            continue;
          if (!Array.isArray(job.steps))
            throw new Error('Missing submission step history; inspect npm');
          if (
            job.steps.some((value) => {
              const step = record(value, 'job step');
              return (
                step.name === 'Submit npm tarball' &&
                step.conclusion !== 'skipped' &&
                step.status !== 'queued'
              );
            })
          )
            return true;
        }
      }
      return false;
    },
    async evidence(tag) {
      const artifacts = await pages('actions/artifacts', 'artifacts');
      const result: Evidence[] = [];
      for (const artifact of artifacts.filter(
        (a) => typeof a.name === 'string' && a.name.startsWith(`npm-${tag}-`),
      )) {
        const run = record(artifact.workflow_run, 'artifact run');
        if (!Number.isSafeInteger(run.id) || !Number.isSafeInteger(artifact.id))
          throw new Error('Invalid artifact identity');
        const origin = record(
          await jsonRequest(`${apiBase}/actions/runs/${run.id}`),
          'artifact origin',
        );
        if (!['release', 'workflow_dispatch'].includes(String(origin.event))) continue;
        if (String(origin.path).split('@')[0] !== '.github/workflows/release.yml') continue;
        if (artifact.expired !== false)
          throw new Error('Staging evidence expired; inspect npm without resending');
        const response = await request(`${apiBase}/actions/artifacts/${artifact.id}/zip`);
        if (!response) throw new Error('Missing staging evidence');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 65536 || Number(artifact.size_in_bytes) > 65536)
          throw new Error('Oversized evidence');
        const zip = join(work, 'evidence.zip');
        await writeFile(zip, bytes);
        if ((await must('unzip', ['-Z1', zip])).trim() !== 'evidence.json')
          throw new Error('Invalid evidence archive');
        const value = JSON.parse(await must('unzip', ['-p', zip, 'evidence.json']));
        result.push(value);
      }
      return result;
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
