import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { record } from '../actions/npm-release/src/json.ts';
import type { ReleaseOutputs } from '../actions/npm-release/src/types.ts';

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
for (const [name, value] of Object.entries(record(workflow.jobs, 'jobs'))) {
  if (name === 'ValidateInputs') continue;
  const job = record(value, 'job');
  const permissions = record(job.permissions, 'permissions');
  assert.equal(permissions.contents, name === 'Verify' ? 'read' : 'write');
  assert.equal(permissions['id-token'], name.includes('Stage') ? 'write' : undefined);
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
for (const file of await readdir('examples')) {
  if (!file.endsWith('.yml')) continue;
  const caller = await yaml(`examples/${file}`);
  assert.equal(record(caller.concurrency, 'concurrency')['cancel-in-progress'], false);
  for (const value of Object.values(record(caller.jobs, 'caller jobs'))) {
    const job = record(value, 'caller job');
    if (job.uses) {
      assert.match(String(job.uses), /^nlibjs\/actions\/\.github\/workflows\/npm-release.yml@/);
      for (const key of Object.keys(record(job.with || {}, 'caller inputs')))
        assert.ok(key in inputs, `${file}: unknown input ${key}`);
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
const validationSteps = steps(record(record(validation.jobs, 'jobs').Validate, 'Validate').steps);
assert.ok(validationSteps.some((step) => step.run === 'npm run typecheck'));
console.log('Workflow YAML, pinned action refs, permissions, outputs and caller contracts passed.');
