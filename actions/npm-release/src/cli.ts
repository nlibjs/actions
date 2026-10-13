import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { record } from './json.ts';
import { runRelease, submit } from './release.ts';
import { createRuntime } from './runtime.ts';
import type { Runtime } from './types.ts';

let io: Runtime | undefined;
try {
  if (Number(process.versions.node.split('.')[0]) !== 26)
    throw new Error('Release tooling requires Node 26.x');
  const input = {
    action: process.env.RELEASE_ACTION,
    tag: process.env.RELEASE_TAG,
    cleanup: process.env.RELEASE_CLEANUP_SOURCE,
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    event: process.env.GITHUB_EVENT_NAME,
    cwd: process.env.GITHUB_WORKSPACE || process.cwd(),
    releaseId: undefined as number | undefined,
  };
  if (input.action === 'stage' && input.event === 'release') {
    const event = record(
      JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH || '', 'utf8')),
      'event',
    );
    const release = record(event.release, 'event Release');
    if (
      event.action !== 'published' ||
      release.tag_name !== input.tag ||
      release.draft !== false ||
      release.prerelease !== false
    )
      throw new Error('Stage requires a stable release: published event');
    if (typeof release.id !== 'number' || !Number.isSafeInteger(release.id) || release.id <= 0)
      throw new Error('Invalid event Release ID');
    input.releaseId = release.id;
  }
  io = await createRuntime({
    repository: input.repository || '',
    actionPath: process.env.COMMON_ACTION_PATH,
  });
  const dir = join(process.env.RUNNER_TEMP || '', 'npm-evidence');
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'evidence.json');
  const phase = process.env.RELEASE_PHASE || 'prepare';
  const result =
    phase === 'prepare'
      ? await runRelease(input, io, path)
      : phase === 'submit'
        ? await submit(input, io, path, process.env.RELEASE_TARBALL || '')
        : (() => {
            throw new Error('Invalid phase');
          })();
  if (process.env.GITHUB_OUTPUT)
    for (const [key, value] of Object.entries(result || {})) {
      if (/[\r\n]/.test(value)) throw new Error('Unexpected multiline workflow output');
      await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await io?.pendingSummary;
}
