import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { buildCommand, sparkExecutable, workspacePath } from '../server/commands.js';
import { Sessions } from '../server/sessions.js';
import { isActive, type RunRequest } from '../shared/model.js';

const request: RunRequest = { command: 'sow', connection: { name: 'Test', server: 'localhost:9007', username: '', password: '', secure: false, proto: 'amps', type: 'json' }, topic: 'orders', filter: '', topn: '10', options: [], helpCommand: '' };
const manager = (grace = 5000) => new Sessions(async () => ({ file: process.execPath, prefix: [path.resolve('tests/fixtures/spark.mjs')] }), grace);
async function until(predicate: () => boolean, timeout = 4000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for subprocess behavior.'); await delay(15); }
}
test('arguments preserve filters literally and redact credentials from previews', async () => {
  const filter = "/name = '$(touch unwanted)'";
  const result = await buildCommand({ ...request, filter, connection: { ...request.connection, username: 'tester', password: 'private-value' } });
  assert.equal(result.args[result.args.indexOf('-filter') + 1], filter);
  assert.ok(result.args.includes('tester:private-value@localhost:9007'));
  assert.ok(!result.preview.includes('private-value'));
});
test('rejects connection overrides, unconfirmed deletions and invalid destinations', async () => {
  await assert.rejects(buildCommand({ ...request, options: [{ flag: 'server', value: 'other:9007' }] }), /duplicate option/);
  await assert.rejects(buildCommand({ ...request, command: 'sow_delete', filter: '/id = 1' }), /confirmation/);
  await assert.rejects(buildCommand({ ...request, connection: { ...request.connection, server: 'localhost:99999' } }), /hostname:port/);
  await assert.rejects(buildCommand({ ...request, connection: { ...request.connection, username: 'tester' } }), /both username and password/);
});
test('Spark exceptions are exact and do not grant access to external input files', async () => {
  const approved = '/explicitly-approved/bin/spark';
  await assert.rejects(sparkExecutable('/explicitly-approved/bin/other', [approved]), /inside this workspace/);
  await assert.rejects(sparkExecutable('/unapproved/bin/spark', [approved]), /inside this workspace/);
  await assert.rejects(workspacePath(approved), /inside this workspace/);
  assert.equal(await sparkExecutable('tests/fixtures/spark.mjs'), path.resolve('tests/fixtures/spark.mjs'));
});
test('publishing sends multiple newline-framed JSON messages to one persistent process', async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const session = await sessions.create({ ...request, command: 'publish' });
  const detach = sessions.attach(session.id); t.after(detach);
  await until(() => session.state === 'running');
  const pid = sessions.get(session.id)!.process.pid;
  await sessions.send(session.id, '{\n "id": 1\n}', 'json');
  await sessions.send(session.id, '{"id":2}', 'json');
  await until(() => session.events.some(e => e.text.includes('received:{"id":2}')));
  assert.equal(sessions.get(session.id)!.process.pid, pid);
  assert.ok(session.events.some(e => e.text.includes('received:{"id":1}')));
  await assert.rejects(sessions.send(session.id, '{broken}', 'json'), /valid JSON/);
  await assert.rejects(sessions.send(session.id, 'one\ntwo', 'text'), /one line/);
  sessions.stop(session.id);
  await until(() => session.state === 'stopped');
});
test('subscriptions stream output and stop when their viewer disconnects', async t => {
  const sessions = manager(100); t.after(() => sessions.shutdown());
  const session = await sessions.create({ ...request, command: 'subscribe' });
  const detach = sessions.attach(session.id);
  await until(() => session.events.filter(e => e.kind === 'stdout').length >= 2);
  detach();
  await until(() => session.state === 'stopped');
});
test('finite commands complete and failed commands preserve exit codes and stderr', async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const finite = await sessions.create(request);
  const failed = await sessions.create({ ...request, command: 'ping' });
  await until(() => !isActive(finite.state) && !isActive(failed.state));
  assert.equal(finite.state, 'completed');
  assert.equal(failed.state, 'failed');
  assert.equal(failed.exitCode, 2);
  assert.ok(failed.events.some(e => e.kind === 'stderr' && e.text.includes('connection refused')));
});
test('Stop kills stubborn descendants as well as the CLI launcher', { skip: process.platform === 'win32' }, async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const session = await sessions.create({ ...request, command: 'latency' });
  const detach = sessions.attach(session.id); t.after(detach);
  await until(() => session.events.some(e => e.text.includes('child alive')));
  sessions.stop(session.id);
  await until(() => session.state === 'stopped');
});
