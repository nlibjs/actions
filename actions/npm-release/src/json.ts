import type { GitObject, PackageMetadata, Release } from './types.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected an object`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}: expected a string`);
  return value;
}

function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid GitHub ID');
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : string(value, label);
}

export function packageMetadata(value: unknown): PackageMetadata {
  const pkg = record(value, 'package metadata');
  const result: PackageMetadata = {
    ...pkg,
    name: string(pkg.name, 'package name'),
    version: string(pkg.version, 'package version'),
  };
  if (pkg.private !== undefined) {
    if (typeof pkg.private !== 'boolean') throw new Error('Invalid private field');
    result.private = pkg.private;
  }
  if (pkg.repository !== undefined) {
    if (typeof pkg.repository === 'string') {
      result.repository = pkg.repository;
    } else {
      const repository = record(pkg.repository, 'repository');
      result.repository = { ...repository, url: optionalString(repository.url, 'repository URL') };
    }
  }
  if (pkg.publishConfig !== undefined) {
    const config = record(pkg.publishConfig, 'publishConfig');
    result.publishConfig = {
      ...config,
      registry: optionalString(config.registry, 'registry'),
      tag: optionalString(config.tag, 'dist-tag'),
      access: optionalString(config.access, 'access'),
    };
  }
  if (pkg.scripts !== undefined) {
    result.scripts = Object.fromEntries(
      Object.entries(record(pkg.scripts, 'scripts')).map(([key, value]) => [
        key,
        string(value, `script ${key}`),
      ]),
    );
  }
  if (pkg.dist !== undefined) {
    const dist = record(pkg.dist, 'dist');
    result.dist = { ...dist, integrity: optionalString(dist.integrity, 'dist.integrity') };
  }
  return result;
}

export function githubRelease(value: unknown): Release {
  const release = record(value, 'GitHub Release');
  if (typeof release.draft !== 'boolean' || typeof release.prerelease !== 'boolean')
    throw new Error('Invalid Release publication flags');
  return {
    id: id(release.id),
    tag_name: string(release.tag_name, 'Release tag'),
    draft: release.draft,
    prerelease: release.prerelease,
    html_url: string(release.html_url, 'Release URL'),
  };
}

export function gitObject(value: unknown): GitObject {
  const object = record(record(value, 'Git reference').object, 'Git object');
  if (object.type !== 'commit' && object.type !== 'tag') throw new Error('Invalid tag object');
  return { type: object.type, sha: string(object.sha, 'Git object SHA') };
}
