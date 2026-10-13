import { packageMetadata } from './json.ts';
import type { PackageMetadata, RawInputs, ReleaseInputs } from './types.ts';

export const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?![\s\S])/;
export const SHA = /^[a-f0-9]{40}(?![\s\S])/;
export const REGISTRY = 'https://registry.npmjs.org/';
export function validateInputs(input: RawInputs): ReleaseInputs {
  const action = input.action || 'verify';
  const tag = input.tag || '';
  const cleanup = input.cleanup || 'registry';
  if (action !== 'verify' && action !== 'stage') throw new Error('Invalid action');
  if (cleanup !== 'registry' && cleanup !== 'local') throw new Error('Invalid cleanup-source');
  if (action === 'stage' ? !VERSION.test(tag.slice(1)) || !tag.startsWith('v') : tag !== '')
    throw new Error('Stage requires a stable Release tag; Verify does not accept a tag');
  if (!/^[\w.-]+\/[\w.-]+(?![\s\S])/.test(input.repository || ''))
    throw new Error('Invalid caller repository');
  if (!SHA.test(input.sha || '')) throw new Error('Invalid caller SHA');
  if (action === 'stage' && !['release', 'workflow_dispatch'].includes(input.event || ''))
    throw new Error('Stage requires a published Release or manual Release retry');
  return {
    ...input,
    action,
    tag,
    cleanup,
    repository: input.repository || '',
    sha: input.sha || '',
  };
}

export function validateManifest(value: unknown, repository: string): PackageMetadata {
  const pkg = packageMetadata(value);
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?![\s\S])/.test(pkg.name || ''))
    throw new Error('Invalid npm package name');
  if (!VERSION.test(pkg.version || ''))
    throw new Error('Only stable package versions are supported');
  if (pkg.private === true || pkg.workspaces)
    throw new Error('Private packages and workspaces are not supported');
  const config = pkg.publishConfig || {};
  if (config.registry && config.registry.replace(/\/$/, '') !== REGISTRY.replace(/\/$/, ''))
    throw new Error('Only the public npm registry is supported');
  if (config.tag && config.tag !== 'latest')
    throw new Error('Only the latest dist-tag is supported');
  if (config.access && config.access !== 'public')
    throw new Error('Only public npm packages are supported');
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const normalized = raw
    ?.replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
  if (normalized !== `https://github.com/${repository}`)
    throw new Error('package.json repository must match the caller repository');
  return pkg;
}

export function changelogNotes(text: string, tag: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## ${tag} `));
  if (start === -1) throw new Error(`CHANGELOG.md has no ${tag} section`);
  const end = lines.findIndex((line, i) => i > start && /^## v/.test(line));
  const notes = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
  if (!notes) throw new Error(`CHANGELOG.md has an empty ${tag} section`);
  return notes;
}
