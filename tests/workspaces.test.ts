import test from 'node:test';
import assert from 'node:assert/strict';
import { initialConnection, newWorkspace, readWorkspaces, restoreWorkspaces, serializeWorkspaces, sessionWorkspaceId } from '../src/workspaces';
import type { Session } from '../shared/model';

const storage = (entries: Record<string, string>) => ({ getItem: (key: string) => entries[key] ?? null });
const session = (workspaceId: string, server = 'localhost:9007'): Session => ({
  id: `session-${workspaceId}`, workspaceId, workspaceName: `Workspace ${workspaceId}`, server, command: 'subscribe', topic: 'orders', preview: '', options: [],
  state: 'running', createdAt: new Date().toISOString(), events: [], totalEvents: 0,
});

test('saved workspaces keep separate connections and selection without persisting passwords', () => {
  const first = { ...newWorkspace({ ...initialConnection, password: 'secret-one', adminUrl: 'http://localhost:8085' }), entered: true };
  const second = { ...newWorkspace({ ...initialConnection, name: 'Remote test', server: 'test:9008', password: 'secret-two' }), entered: true };
  const draft = newWorkspace();
  const serialized = serializeWorkspaces({ workspaces: [first, second, draft], selected: second.id });
  assert.ok(!serialized.includes('secret-one') && !serialized.includes('secret-two'));
  const restored = readWorkspaces(storage({ 'spark.workspaces': serialized }));
  assert.equal(restored.selected, second.id);
  assert.equal(restored.workspaces.length, 2);
  assert.equal(restored.workspaces[0].connection.adminUrl, 'http://localhost:8085');
  assert.equal(restored.workspaces[1].connection.server, 'test:9008');
  assert.ok(restored.workspaces.every(workspace => workspace.entered && workspace.connection.password === ''));
  assert.equal(first.connection.password, 'secret-one');
});

test('legacy connection preferences migrate and malformed storage falls back to a usable entry form', () => {
  const migrated = readWorkspaces(storage({ 'spark.connection': JSON.stringify({ ...initialConnection, name: 'Existing', password: 'discard-me' }) }));
  assert.equal(migrated.workspaces[0].connection.name, 'Existing');
  assert.equal(migrated.workspaces[0].connection.password, '');
  assert.equal(migrated.workspaces[0].entered, false);
  for (const source of [storage({ 'spark.workspaces': '{broken' }), { getItem: () => { throw new Error('Storage blocked'); } }]) {
    const result = readWorkspaces(source);
    assert.equal(result.workspaces.length, 1);
    assert.equal(result.selected, result.workspaces[0].id);
    assert.equal(result.workspaces[0].connection.server, 'localhost:9007');
  }
});

test('refresh matches sessions by workspace ID even for two profiles on the same server', () => {
  const first = { ...newWorkspace(), entered: true };
  const second = { ...newWorkspace(), entered: true };
  const store = { workspaces: [first, second], selected: second.id };
  const sessions = [session(first.id), session(second.id)];
  const restored = restoreWorkspaces(store, sessions);
  assert.deepEqual(restored, store);
  assert.deepEqual(sessions.filter(item => sessionWorkspaceId(item) === second.id).map(item => item.id), [`session-${second.id}`]);
  const unknown = { ...session('another'), options: [{ flag: 'type', value: 'xml' }, { flag: 'secure', value: 'true' }] };
  const recovered = restoreWorkspaces(store, [...sessions, unknown]);
  assert.equal(recovered.workspaces.length, 3);
  assert.equal(recovered.workspaces[2].id, 'another');
  assert.equal(recovered.workspaces[2].connection.type, 'xml');
  assert.equal(recovered.workspaces[2].connection.secure, true);
  assert.equal(recovered.workspaces[2].connection.password, '');
  assert.equal(recovered.selected, second.id);
  assert.equal(restoreWorkspaces(recovered, [...sessions, unknown]).workspaces.length, 3);
});

test('duplicate or invalid saved workspace IDs are ignored and a missing selection falls back', () => {
  const workspace = { ...newWorkspace(), entered: true };
  const saved = { workspaces: [workspace, workspace, { ...workspace, id: '../bad' }], selected: 'removed' };
  const restored = readWorkspaces(storage({ 'spark.workspaces': JSON.stringify(saved) }));
  assert.equal(restored.workspaces.length, 1);
  assert.equal(restored.selected, workspace.id);
});
