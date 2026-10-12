import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';

async function yaml(path) {
  const document = parseDocument(await readFile(path, 'utf8'), { uniqueKeys: true });
  assert.equal(document.errors.length, 0, `${path}: ${document.errors.join(', ')}`);
  return document.toJS();
}
const workflow = await yaml('.github/workflows/npm-release.yml');
const contract = workflow.on.workflow_call;
assert.deepEqual(Object.keys(contract.inputs).sort(), [
  'action',
  'cleanup-source',
  'environment',
  'version',
]);
assert.equal(contract.inputs.action.default, 'verify');
for (const [name, job] of Object.entries(workflow.jobs)) {
  if (name === 'ValidateInputs') continue;
  assert.equal(job.permissions.contents, name === 'Verify' ? 'read' : 'write');
  assert.equal(job.permissions['id-token'], name.includes('Stage') ? 'write' : undefined);
  assert.equal(Boolean(job.environment), name.startsWith('Protected'));
  for (const step of job.steps) {
    if (step.uses)
      assert.match(step.uses, /@[a-f0-9]{40}$/, `${name}: action refs must be full SHAs`);
    if (step.uses?.startsWith('actions/checkout')) {
      assert.equal(step.with['fetch-depth'], 0);
      assert.equal(step.with['persist-credentials'], false);
    }
  }
}
const action = await yaml('actions/npm-release/action.yml');
assert.deepEqual(Object.keys(action.outputs).sort(), Object.keys(contract.outputs).sort());
for (const file of await readdir('examples')) {
  if (!file.endsWith('.yml')) continue;
  const caller = await yaml(`examples/${file}`);
  assert.equal(caller.concurrency['cancel-in-progress'], false);
  for (const job of Object.values(caller.jobs)) {
    if (job.uses) {
      assert.match(job.uses, /^nlibjs\/actions\/\.github\/workflows\/npm-release.yml@/);
      for (const key of Object.keys(job.with || {}))
        assert.ok(key in contract.inputs, `${file}: unknown input ${key}`);
    }
    for (const step of job.steps || []) {
      if (step.uses?.startsWith('actions/checkout')) {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
        assert.equal(step.with.ref, '${{ needs.Finalize.outputs.source-sha }}');
      }
    }
  }
}
await yaml('.github/workflows/validate.yml');
console.log('Workflow YAML, pinned action refs, permissions, outputs and caller contracts passed.');
