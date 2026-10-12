import { appendFile } from 'node:fs/promises';
import { runRelease } from './release.ts';
import { createRuntime } from './runtime.ts';

import type { Runtime } from './types.ts';

let io: Runtime | undefined;
try {
  if (Number(process.versions.node.split('.')[0]) !== 26)
    throw new Error('Release tooling requires Node 26.x');
  const input = {
    action: process.env.RELEASE_ACTION,
    version: process.env.RELEASE_VERSION,
    cleanup: process.env.RELEASE_CLEANUP_SOURCE,
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    ref: process.env.GITHUB_REF,
    event: process.env.GITHUB_EVENT_NAME,
    cwd: process.env.GITHUB_WORKSPACE || process.cwd(),
  };
  io = await createRuntime({
    repository: input.repository || '',
    actionPath: process.env.COMMON_ACTION_PATH,
  });
  const result = await runRelease(input, io);
  if (process.env.GITHUB_OUTPUT) {
    for (const [key, value] of Object.entries(result)) {
      if (/[\r\n]/.test(value)) throw new Error('Unexpected multiline workflow output');
      await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await io?.pendingSummary;
}
