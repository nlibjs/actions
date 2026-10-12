export type Action = 'verify' | 'stage';
export type CleanupSource = 'registry' | 'local';
export interface RawInputs {
  action?: string;
  tag?: string;
  cleanup?: string;
  repository?: string;
  sha?: string;
  event?: string;
  releaseId?: number;
  cwd: string;
}
export interface ReleaseInputs extends RawInputs {
  action: Action;
  tag: string;
  cleanup: CleanupSource;
  repository: string;
  sha: string;
}
export interface ReleaseOutputs {
  'package-name': string;
  version: string;
  tag: string;
  'source-sha': string;
  'npm-state': 'unknown' | 'staged' | 'published';
  'release-url': string;
}
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
export interface Release {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
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
export interface Evidence {
  repository: string;
  release: number;
  tag: string;
  sha: string;
  name: string;
  version: string;
  integrity: string;
  state: 'prepared' | 'unknown' | 'staged';
  stageId?: string;
}
export interface Runtime {
  release(tag: string): Promise<Release>;
  tagSha(tag: string): Promise<string | null>;
  published(name: string, version: string): Promise<PackageMetadata | null>;
  evidence(tag: string): Promise<Evidence[]>;
  submissionStarted(tag: string): Promise<boolean>;
  prepare(cwd: string): Promise<void>;
  cleanup(cwd: string, source: CleanupSource): Promise<void>;
  pack(cwd: string): Promise<PackedTarball>;
  inspectTarball(tarball: string): Promise<InspectedTarball>;
  stage(tarball: string): Promise<CommandResult>;
  summary(message: string): void;
  pendingSummary?: Promise<void>;
}
