import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReusablePermissions } from '../scripts/workflow-permissions.ts';

const readOnly = { contents: 'read' };
const finalize = { contents: 'write' };
const stage = { contents: 'write', 'id-token': 'write' };
const inherited = {
  jobs: {
    ValidateInputs: { permissions: readOnly },
    Verify: { permissions: readOnly },
    Stage: {},
    ProtectedStage: {},
    Finalize: {},
    ProtectedFinalize: {},
  },
};

test('a skipped nested stage must not request writes from a read-only verify caller', () => {
  const broken = { jobs: { Stage: { if: false, permissions: stage } } };
  assert.throws(
    () => checkReusablePermissions(broken, readOnly, 'Verify'),
    /Stage requests contents/,
  );
});

test('a skipped nested stage must not request OIDC from a finalize caller', () => {
  const broken = { jobs: { ProtectedStage: { if: false, permissions: stage } } };
  assert.throws(() => checkReusablePermissions(broken, finalize, 'Finalize'), /id-token/);
});

test('workflow-level requests are also bounded by caller permissions', () => {
  assert.throws(
    () => checkReusablePermissions({ permissions: stage, jobs: { Stage: {} } }, readOnly, 'Verify'),
    /contents/,
  );
});

test('inherited publishing jobs work with all three least-privilege caller profiles', () => {
  for (const permissions of [readOnly, finalize, stage]) {
    assert.doesNotThrow(() => checkReusablePermissions(inherited, permissions, 'Caller'));
  }
});
