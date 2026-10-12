export type Action = 'verify' | 'stage' | 'finalize';
export type CleanupSource = 'registry' | 'local';
export type NpmState = 'unknown' | 'staged' | 'published';
export type GithubState = 'absent' | 'draft' | 'published';

export interface RawInputs {
  action?: string;
  version?: string;
  cleanup?: string;
  repository?: string;
  sha?: string;
  ref?: string;
  event?: string;
  cwd: string;
}

export interface ReleaseInputs extends RawInputs {
  action: Action;
  version: string;
  cleanup: CleanupSource;
  repository: string;
  sha: string;
}

export interface ReleaseOutputs {
  'package-name': string;
  version: string;
  tag: string;
  'source-sha': string;
  'npm-state': NpmState;
  'github-state': GithubState;
  'jsr-ready': 'true' | 'false';
  'release-url': string;
}

// Unknown fields remain available for the consumer-field preservation checks.
export interface PackageMetadata {
  [field: string]: unknown;
  name: string;
  version: string;
  private?: boolean;
  repository?: string | { url?: string };
  publishConfig?: { registry?: string; tag?: string; access?: string };
  scripts?: Record<string, string>;
  dist?: { integrity?: string };
}

export interface ReleaseAsset {
  id: number;
  name: string;
  state: string;
  url?: string;
}

export interface Release {
  id: number;
  tag_name: string;
  target_commitish: string;
  draft: boolean;
  html_url: string;
  assets: ReleaseAsset[];
  body?: string | null;
  upload_url?: string;
}

export interface GitObject {
  type: 'commit' | 'tag';
  sha: string;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr?: string;
  signal?: NodeJS.Signals | null;
}

export interface InspectedTarball {
  pkg: PackageMetadata;
  integrity: string;
  files: string[];
}

export interface PackedTarball extends InspectedTarball {
  tarball: string;
}

// Mutation results that the release orchestration never reads are deliberately void.
export interface Runtime {
  releases(): Promise<Release[]>;
  published(name: string, version: string): Promise<PackageMetadata | null>;
  tagSha(tag: string): Promise<string | null>;
  retainSource(version: string, sha: string): Promise<void>;
  removeSource(version: string, sha: string): Promise<void>;
  prepare(cwd: string): Promise<void>;
  cleanup(cwd: string, source: CleanupSource): Promise<void>;
  pack(cwd: string): Promise<PackedTarball>;
  inspectTarball(tarball: string): Promise<InspectedTarball>;
  createDraft(tag: string, sha: string, body: string): Promise<Release>;
  upload(release: Release, name: string, path: string): Promise<void>;
  uploadText(release: Release, name: string, text: string): Promise<void>;
  download(asset: ReleaseAsset): Promise<string>;
  downloadText(asset: ReleaseAsset): Promise<string>;
  stage(tarball: string): Promise<CommandResult>;
  updateBody(release: Release, body: string): Promise<void>;
  publishDraft(release: Release): Promise<Release>;
  summary(message: string): void;
  pendingSummary?: Promise<void>;
}
