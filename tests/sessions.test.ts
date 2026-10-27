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
  assert.equal(result.options.find(option => option.flag === 'server')?.value, 'tester:***@localhost:9007');
  assert.equal(result.options.find(option => option.flag === 'filter')?.value, filter);
});
test('session options capture exact values and valueless flags without exposing credentials', async () => {
  const result = await buildCommand({ ...request, connection: { ...request.connection, secure: true, username: 'tester', password: 'private-value', adminUrl: 'http://localhost:8085' }, options: [{ flag: 'stats', value: '' }, { flag: 'bookmark', value: '-42' }, { flag: 'copy', value: 'other:copy-secret@localhost:9008' }, { flag: 'token', value: 'token-secret' }] });
  assert.equal(result.options.find(option => option.flag === 'secure')?.value, 'true');
  assert.equal(result.options.find(option => option.flag === 'topn')?.value, '10');
  assert.equal(result.options.find(option => option.flag === 'stats')?.value, null);
  assert.equal(result.options.find(option => option.flag === 'bookmark')?.value, '-42');
  assert.ok(result.args.includes('other:copy-secret@localhost:9008'));
  assert.ok(result.args.includes('token-secret'));
  const display = JSON.stringify({ options: result.options, preview: result.preview });
  for (const secret of ['private-value', 'copy-secret', 'token-secret', '8085']) assert.ok(!display.includes(secret));
});
test('help options describe only the help target, with no unused connection settings', async () => {
  const help = await buildCommand({ ...request, command: 'help', helpCommand: 'subscribe' });
  assert.deepEqual(help.options, [{ flag: 'Help target', value: 'subscribe' }]);
  assert.deepEqual((await buildCommand({ ...request, command: 'help' })).options, []);
});
test('session options remain the original launch snapshot in history and status updates', async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const input = { ...request, connection: { ...request.connection }, options: [{ flag: 'orderby', value: '/id DESC' }] };
  const session = await sessions.create(input);
  input.topic = 'edited-topic'; input.connection.server = 'changed:9999'; input.options[0].value = '/other ASC';
  await until(() => !isActive(session.state));
  const history = sessions.list().find(item => item.id === session.id)!;
  assert.equal(history.options.find(option => option.flag === 'topic')?.value, 'orders');
  assert.equal(history.options.find(option => option.flag === 'server')?.value, 'localhost:9007');
  assert.equal(history.options.find(option => option.flag === 'orderby')?.value, '/id DESC');
  assert.deepEqual(sessions.summary(sessions.get(session.id)!).options, history.options);
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
test('removing a finished session clears backend history and notifies attached viewers', async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const session = await sessions.create(request);
  const runtime = sessions.get(session.id)!;
  const detach = sessions.attach(session.id); t.after(detach);
  await until(() => Boolean(session.endedAt));
  const notifications: unknown[] = [];
  runtime.bus.on('removed', event => notifications.push(event));
  assert.equal(await sessions.remove(session.id), true);
  assert.equal(sessions.get(session.id), undefined);
  assert.deepEqual(sessions.list(), []);
  assert.deepEqual(notifications, [{ id: session.id }]);
  assert.equal(runtime.bus.eventNames().length, 0);
  assert.equal(await sessions.remove(session.id), false);
});
test('removing a running publisher waits for process exit and is safe to request twice', async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const session = await sessions.create({ ...request, command: 'publish' });
  const runtime = sessions.get(session.id)!;
  const detach = sessions.attach(session.id); t.after(detach);
  await until(() => session.events.some(event => event.text.includes('publisher ready')));
  const first = sessions.remove(session.id);
  const second = sessions.remove(session.id);
  assert.equal(first, second);
  assert.equal(sessions.get(session.id), runtime);
  assert.equal(session.state, 'stopping');
  await first;
  assert.equal(session.state, 'stopped');
  assert.ok(session.endedAt);
  assert.equal(runtime.killTimer, undefined);
  assert.equal(sessions.get(session.id), undefined);
  await assert.rejects(sessions.send(session.id, '{"id":1}', 'json'), /Start a publisher/);
});
test('clear finished removes completed, failed, and stopped sessions but preserves active subscriptions', async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const completed = await sessions.create(request);
  const failed = await sessions.create({ ...request, command: 'ping' });
  const stopped = await sessions.create({ ...request, command: 'publish' });
  const active = await sessions.create({ ...request, command: 'subscribe' });
  const detach = sessions.attach(active.id); t.after(detach);
  await until(() => stopped.state === 'running' && active.events.some(event => event.kind === 'stdout'));
  sessions.stop(stopped.id);
  await until(() => Boolean(completed.endedAt && failed.endedAt && stopped.endedAt));
  const removed = await sessions.clearFinished();
  assert.deepEqual(new Set(removed), new Set([completed.id, failed.id, stopped.id]));
  assert.deepEqual(sessions.list().map(session => session.id), [active.id]);
  assert.equal(active.state, 'running');
  const count = active.totalEvents;
  await until(() => active.totalEvents > count);
  assert.deepEqual(await sessions.clearFinished(), []);
});
test('removal cleans up stubborn process groups before forgetting them', { skip: process.platform === 'win32' }, async t => {
  const sessions = manager(); t.after(() => sessions.shutdown());
  const session = await sessions.create({ ...request, command: 'latency' });
  const detach = sessions.attach(session.id); t.after(detach);
  const runtime = sessions.get(session.id)!;
  await until(() => session.events.some(event => event.text.includes('child alive')));
  await sessions.remove(session.id);
  assert.equal(session.state, 'stopped');
  assert.ok(session.endedAt);
  assert.equal(runtime.killTimer, undefined);
  assert.equal(sessions.list().length, 0);
});
