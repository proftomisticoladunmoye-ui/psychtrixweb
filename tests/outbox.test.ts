import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldQueue, opLabel, replayOutcome } from '../src/lib/outbox';

test('shouldQueue: only db mutations are queued offline', () => {
  assert.equal(shouldQueue('POST', '/db/datasets'), true);
  assert.equal(shouldQueue('PATCH', '/db/sandbox_scale_projects?eq.id=1'), true);
  assert.equal(shouldQueue('DELETE', '/db/datasets?eq.id=1'), true);
  // never queue reads, auth or rpc
  assert.equal(shouldQueue('GET', '/db/datasets'), false);
  assert.equal(shouldQueue('POST', '/auth/signin'), false);
  assert.equal(shouldQueue('POST', '/rpc/whatever'), false);
});

test('opLabel is human-readable', () => {
  assert.equal(opLabel({ action: 'insert', table: 'datasets' }), 'Save datasets');
  assert.equal(opLabel({ action: 'update', table: 'settings' }), 'Update settings');
  assert.equal(opLabel({ action: 'delete', table: 'datasets' }), 'Delete datasets');
});

test('replayOutcome maps HTTP status to queue action', () => {
  assert.equal(replayOutcome(200), 'done');
  assert.equal(replayOutcome(201), 'done');
  assert.equal(replayOutcome(400), 'drop');   // client error — will never succeed
  assert.equal(replayOutcome(409), 'drop');
  assert.equal(replayOutcome(0), 'retry');     // still offline
  assert.equal(replayOutcome(500), 'retry');   // server hiccup — retry later
  assert.equal(replayOutcome(503), 'retry');
});
