import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { record } from '../actions/npm-release/src/json.ts';
import type { ReleaseOutputs } from '../actions/npm-release/src/types.ts';
import { checkReusablePermissions } from './workflow-permissions.ts';

async function yaml(path: string): Promise<Record<string, unknown>> {
  const document = parseDocument(await readFile(path, 'utf8'), { uniqueKeys: true });
  assert.equal(document.errors.length, 0, `${path}: ${document.errors.join(', ')}`);
  return record(document.toJS(), path);
}
function steps(value: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(value));
  return value.map((step) => record(step, 'step'));
}
const workflow = await yaml('.github/workflows/npm-release.yml');
const contract = record(record(workflow.on, 'on').workflow_call, 'workflow_call');
const inputs = record(contract.inputs, 'inputs');
const outputs = record(contract.outputs, 'outputs');
assert.deepEqual(Object.keys(inputs).sort(), [
  'action',
  'cleanup-source',
  'environment',
  'version',
]);
assert.equal(record(inputs.action, 'action').default, 'verify');
const outputNames = [
  'package-name',
  'version',
  'tag',
  'source-sha',
  'npm-state',
  'github-state',
  'jsr-ready',
  'release-url',
] satisfies (keyof ReleaseOutputs)[];
assert.deepEqual(Object.keys(outputs).sort(), outputNames.sort());
assert.equal(workflow.permissions, undefined, 'Publishing jobs must inherit caller permissions');
for (const [name, value] of Object.entries(record(workflow.jobs, 'jobs'))) {
  const job = record(value, 'job');
  if (name === 'ValidateInputs' || name === 'Verify') {
    assert.deepEqual(job.permissions, { contents: 'read' });
  } else {
    assert.equal(job.permissions, undefined, `${name}: inherit the caller permission ceiling`);
  }
  if (name === 'ValidateInputs') continue;
  assert.equal(Boolean(job.environment), name.startsWith('Protected'));
  for (const step of steps(job.steps)) {
    if (step.uses) {
      assert.equal(typeof step.uses, 'string');
      assert.match(String(step.uses), /@[a-f0-9]{40}$/, `${name}: action refs must be full SHAs`);
    }
    if (String(step.uses).startsWith('actions/checkout')) {
      const options = record(step.with, 'checkout options');
      assert.equal(options['fetch-depth'], 0);
      assert.equal(options['persist-credentials'], false);
    }
  }
}
const action = await yaml('actions/npm-release/action.yml');
assert.deepEqual(
  Object.keys(record(action.outputs, 'action outputs')).sort(),
  Object.keys(outputs).sort(),
);
const entrypoint = steps(record(action.runs, 'action runs').steps).find(
  (step) => step.id === 'release',
);
assert.equal(entrypoint?.run, 'node "$COMMON_ACTION_PATH/src/cli.ts"');
const callerFiles = [
  ...(await readdir('examples'))
    .filter((file) => file.endsWith('.yml'))
    .map((file) => `examples/${file}`),
  ...process.argv.slice(2),
];
for (const file of callerFiles) {
  const caller = await yaml(file);
  assert.equal(record(caller.concurrency, 'concurrency')['cancel-in-progress'], false);
  for (const value of Object.values(record(caller.jobs, 'caller jobs'))) {
    const job = record(value, 'caller job');
    if (job.uses) {
      assert.match(String(job.uses), /^nlibjs\/actions\/\.github\/workflows\/npm-release.yml@/);
      const options = record(job.with || {}, 'caller inputs');
      for (const key of Object.keys(options))
        assert.ok(key in inputs, `${file}: unknown input ${key}`);
      const permissions = record(job.permissions, 'caller permissions');
      const operation = options.action || 'verify';
      assert.ok(['verify', 'stage', 'finalize'].includes(String(operation)));
      assert.deepEqual(
        permissions,
        operation === 'verify'
          ? { contents: 'read' }
          : operation === 'stage'
            ? { contents: 'write', 'id-token': 'write' }
            : { contents: 'write' },
      );
      checkReusablePermissions(workflow, permissions, file);
    }
    for (const step of steps(job.steps || [])) {
      if (String(step.uses).startsWith('actions/checkout')) {
        assert.equal(
          record(step.with, 'checkout options').ref,
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
          '${{ needs.Finalize.outputs.source-sha }}',
        );
      }
    }
  }
}
const validation = await yaml('.github/workflows/validate.yml');
assert.deepEqual(validation.on, ['push', 'pull_request']);
const validationJobs = record(validation.jobs, 'jobs');
for (const [name, expected] of [
  ['VerifyPermissionContract', { contents: 'read' }],
  ['FinalizePermissionContract', { contents: 'write' }],
] satisfies [string, Record<string, string>][]) {
  const job = record(validationJobs[name], name);
  assert.deepEqual(job.permissions, expected);
  assert.equal(job.uses, './.github/workflows/npm-release.yml');
  assert.equal(job.if, "github.event_name == 'workflow_dispatch'");
  checkReusablePermissions(workflow, expected, name);
}
const validationSteps = steps(record(validationJobs.Validate, 'Validate').steps);
assert.ok(validationSteps.some((step) => step.run === 'npm run typecheck'));
console.log('Workflow YAML, pinned action refs, permissions, outputs and caller contracts passed.');
