import assert from 'node:assert/strict';
import { record } from '../actions/npm-release/src/json.ts';

function level(value: unknown): number {
  if (value === undefined || value === 'none') return 0;
  if (value === 'read') return 1;
  if (value === 'write') return 2;
  throw new Error(`Unexpected permission access: ${String(value)}`);
}

// GitHub validates every nested job, including jobs disabled by an if condition.
export function checkReusablePermissions(
  workflow: Record<string, unknown>,
  callerPermissions: Record<string, unknown>,
  caller: string,
): void {
  for (const [name, value] of Object.entries(record(workflow.jobs, 'jobs'))) {
    const job = record(value, 'job');
    const requested = job.permissions ?? workflow.permissions;
    // With no explicit callee permissions, the job inherits the caller's ceiling.
    if (requested === undefined) continue;
    for (const [scope, access] of Object.entries(record(requested, 'permissions'))) {
      assert.ok(
        level(access) <= level(callerPermissions[scope]),
        `${caller}: nested ${name} requests ${scope}: ${String(access)} above caller permissions`,
      );
    }
  }
}
