import { isRecord, packageMetadata } from './json.ts';
import type { PackageMetadata, RawInputs, Release, ReleaseInputs } from './types.ts';

export const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?![\s\S])/;
export const SHA = /^[a-f0-9]{40}(?![\s\S])/;
export const REGISTRY = 'https://registry.npmjs.org/';
export const TARBALL_ASSET = 'package.tgz';
export const INTEGRITY_ASSET = 'package.integrity';

export function validateInputs(input: RawInputs): ReleaseInputs {
  const action = input.action || 'verify';
  const version = input.version || '';
  const cleanup = input.cleanup || 'registry';
  if (action !== 'verify' && action !== 'stage' && action !== 'finalize')
    throw new Error('Invalid action');
  if (cleanup !== 'registry' && cleanup !== 'local') throw new Error('Invalid cleanup-source');
  if (action === 'finalize' ? !VERSION.test(version) : version !== '') {
    throw new Error('Only finalize accepts version; use a stable version such as 1.2.3');
  }
  if (!/^[\w.-]+\/[\w.-]+(?![\s\S])/.test(input.repository || ''))
    throw new Error('Invalid caller repository');
  if (action !== 'finalize' && !SHA.test(input.sha || '')) throw new Error('Invalid caller SHA');
  if (
    action !== 'verify' &&
    (input.ref !== 'refs/heads/main' || !['push', 'workflow_dispatch'].includes(input.event || ''))
  ) {
    throw new Error('Publishing requires a main push or a main workflow_dispatch');
  }
  return {
    ...input,
    action,
    version,
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

export function selectRelease(releases: Release[], tag: string): Release | null {
  const matches = releases.filter((r) => r.tag_name === tag);
  if (matches.length > 1)
    throw new Error(`Duplicate releases for ${tag}: ${matches.map((r) => r.id).join(', ')}`);
  return matches[0] || null;
}

export function decideStage({
  release,
  published,
  tagSha,
}: {
  release: Release | null;
  published: PackageMetadata | null;
  tagSha: string | null;
}): 'draft' | 'published' | 'new' {
  if (release?.draft) {
    const names = release.assets?.map((a) => a.name) || [];
    if (!names.includes(TARBALL_ASSET) || !names.includes(INTEGRITY_ASSET))
      throw new Error('Existing draft has missing assets; inspect it before retrying');
    return 'draft';
  }
  if (published && tagSha) return 'published';
  if (published || tagSha || release)
    throw new Error('npm, tag and release disagree; do not stage automatically');
  return 'new';
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

export function optionalStageId(stdout: string): string {
  try {
    const data: unknown = JSON.parse(stdout);
    if (!isRecord(data) && !Array.isArray(data)) return '';
    const nested = Object.values(data).find((v) => isRecord(v) && v.stageId);
    const direct = isRecord(data) ? data.stageId : undefined;
    const candidate = direct ?? (isRecord(nested) ? nested.stageId : undefined);
    return typeof candidate === 'string' && /^[\w-]{1,200}$/.test(candidate) ? candidate : '';
  } catch {
    return '';
  }
}

export function finalizeInstructions(version: string): string {
  return `Approve this version in npmjs.com → Staged Packages. Then run the caller's Release workflow on main with action=finalize and version=${version}.`;
}
