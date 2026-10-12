import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { record } from '../actions/npm-release/src/json.ts';
import { checkReusablePermissions } from './workflow-permissions.ts';

async function yaml(path: string) {
  const doc = parseDocument(await readFile(path, 'utf8'), { uniqueKeys: true });
  assert.equal(doc.errors.length, 0, path);
  return record(doc.toJS(), path);
}
const workflow = await yaml('.github/workflows/npm-release.yml');
const contract = record(record(workflow.on, 'on').workflow_call, 'contract');
const inputs = record(contract.inputs, 'inputs'),
  outputs = record(contract.outputs, 'outputs');
assert.deepEqual(Object.keys(inputs).sort(), [
  'action',
  'cleanup-source',
  'environment',
  'source-sha',
  'tag',
]);
assert.equal(record(inputs.action, 'action').default, 'verify');
assert.deepEqual(Object.keys(outputs).sort(), [
  'npm-state',
  'package-name',
  'release-url',
  'source-sha',
  'tag',
  'version',
]);
assert.equal(workflow.permissions, undefined);
for (const [name, value] of Object.entries(record(workflow.jobs, 'jobs'))) {
  const job = record(value, name);
  assert.deepEqual(job.permissions, name === 'Verify' ? { contents: 'read' } : undefined);
  assert.equal(Boolean(job.environment), name === 'ProtectedStage');
  assert.ok(Array.isArray(job.steps));
  for (const value of job.steps) {
    const step = record(value, 'step');
    if (step.uses) assert.match(String(step.uses), /@[a-f0-9]{40}$/);
  }
}
const action = await yaml('actions/npm-release/action.yml');
assert.deepEqual(
  Object.keys(record(action.outputs, 'outputs')).sort(),
  Object.keys(outputs).sort(),
);
const actionSteps = record(action.runs, 'runs').steps;
assert.ok(Array.isArray(actionSteps));
for (const value of actionSteps) {
  const step = record(value, 'step');
  if (step.uses) assert.match(String(step.uses), /@[a-f0-9]{40}$/);
  if (String(step.uses).startsWith('actions/checkout')) {
    assert.equal(record(step.with, 'checkout')['fetch-depth'], 0);
    assert.equal(record(step.with, 'checkout')['persist-credentials'], false);
  }
}
for (const file of [
  ...(await readdir('examples')).filter((f) => f.endsWith('.yml')).map((f) => `examples/${f}`),
  ...process.argv.slice(2),
]) {
  const caller = await yaml(file),
    events = record(caller.on, 'on');
  assert.deepEqual(record(events.release, 'release').types, ['published']);
  assert.equal(events.push, undefined);
  assert.equal(record(caller.concurrency, 'concurrency')['cancel-in-progress'], false);
  assert.match(String(record(caller.concurrency, 'concurrency').group), /tag/);
  const jobs = record(caller.jobs, 'jobs');
  for (const [name, value] of Object.entries(jobs)) {
    const job = record(value, name);
    if (job.uses) {
      const options = record(job.with, 'options');
      for (const key of Object.keys(options)) assert.ok(key in inputs, `${file}: unknown ${key}`);
      const permissions = record(job.permissions, 'permissions');
      assert.deepEqual(
        permissions,
        options.action === 'verify'
          ? { contents: 'read' }
          : { contents: 'read', actions: 'read', 'id-token': 'write' },
      );
      checkReusablePermissions(workflow, permissions, file);
    }
  }
  if (jobs.PublishJsr) {
    const jsr = record(jobs.PublishJsr, 'JSR');
    assert.equal(jsr.needs, 'Source');
    assert.equal(record(jobs.Stage, 'Stage').needs, 'Source');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression.
    const source = '${{ needs.Source.outputs.sha }}';
    assert.equal(record(record(jobs.Stage, 'Stage').with, 'with')['source-sha'], source);
    assert.ok(Array.isArray(jsr.steps));
    const checkout = jsr.steps
      .map((s) => record(s, 'step'))
      .find((s) => String(s.uses).startsWith('actions/checkout'));
    assert.equal(record(checkout?.with, 'checkout').ref, source);
    assert.ok(!String(jsr.if).includes("inputs.action == 'stage'"));
  }
}
const validation = await yaml('.github/workflows/validate.yml');
assert.deepEqual(validation.on, ['push', 'pull_request']);
for (const [name, permissions] of [
  ['VerifyPermissionContract', { contents: 'read' }],
  ['StagePermissionContract', { contents: 'read', actions: 'read', 'id-token': 'write' }],
] as const) {
  const job = record(record(validation.jobs, 'jobs')[name], name);
  assert.equal(job.if, "github.event_name == 'workflow_dispatch'");
  assert.deepEqual(job.permissions, permissions);
  checkReusablePermissions(workflow, permissions, name);
}
console.log('Workflow contracts, permissions, action pins and parallel caller sources passed.');
