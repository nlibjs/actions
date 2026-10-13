import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReusablePermissions } from '../scripts/workflow-permissions.ts';

const readOnly = { contents: 'read' };
const stage = { contents: 'read', actions: 'read', 'id-token': 'write' };
const inherited = {
  jobs: {
    Verify: { permissions: readOnly },
    Stage: {},
  },
};

test('a skipped nested stage must not request writes from a read-only verify caller', () => {
  const broken = { jobs: { Stage: { if: false, permissions: stage } } };
  assert.throws(
    () => checkReusablePermissions(broken, readOnly, 'Verify'),
    /Stage requests actions/,
  );
});

test('a skipped nested stage must not request OIDC from a read-only caller', () => {
  const broken = { jobs: { Stage: { if: false, permissions: { 'id-token': 'write' } } } };
  assert.throws(() => checkReusablePermissions(broken, readOnly, 'Verify'), /id-token/);
});

test('workflow-level requests are also bounded by caller permissions', () => {
  assert.throws(
    () => checkReusablePermissions({ permissions: stage, jobs: { Stage: {} } }, readOnly, 'Verify'),
    /actions/,
  );
});

test('inherited publishing jobs work with both least-privilege caller profiles', () => {
  for (const permissions of [readOnly, stage]) {
    assert.doesNotThrow(() => checkReusablePermissions(inherited, permissions, 'Caller'));
  }
});
