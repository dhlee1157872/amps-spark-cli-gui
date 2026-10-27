import test from 'node:test';
import assert from 'node:assert/strict';
import { adminTopicsEndpoint, matchingTopics } from '../shared/topics.js';
import { extractTopicNames, fetchTopicNames } from '../server/topics.js';

const sample = { amps: { instance: { sow: [
  { topic: 'topic2', id: 'topic2!json', message_type: 'json', valid_keys: '3' },
  { topic: '/topic50', path: '/not-returned', valid_keys: '0' },
  { topic: 'SOW/GLOBAL/RFQ', id: 'SOW_GLOBAL_RFQ!json' },
  { topic: 'topic2', message_type: 'xml' },
  { topic: 'topic1' },
] } } };

test('admin URLs accept a base URL, instance URL, or complete SOW endpoint', () => {
  for (const input of ['http://localhost:8085', 'http://localhost:8085/', 'http://localhost:8085/amps', 'http://localhost:8085/amps/instance/', 'http://localhost:8085/amps/instance/sow.json']) {
    assert.equal(adminTopicsEndpoint(input), 'http://localhost:8085/amps/instance/sow.json');
  }
  assert.equal(adminTopicsEndpoint('https://example.test/admin/'), 'https://example.test/admin/amps/instance/sow.json');
  for (const input of ['', null, 'localhost:8085', 'file:///tmp/sow.json', 'http://user:secret@localhost:8085', 'http://localhost:8085/?key=secret', 'http://localhost:8085/#section']) {
    assert.throws(() => adminTopicsEndpoint(input));
  }
});

test('only unique topic names are returned; names preserve punctuation and case', () => {
  assert.deepEqual(extractTopicNames(sample), ['/topic50', 'SOW/GLOBAL/RFQ', 'topic1', 'topic2']);
  assert.deepEqual(extractTopicNames({ amps: { instance: { sow: [] } } }), []);
  assert.throws(() => extractTopicNames({ topics: ['topic1'] }), /amps.instance.sow/);
  assert.throws(() => extractTopicNames({ amps: { instance: { sow: [{ topic: 123 }] } } }), /invalid topic name/);
});

test('typing filters by substring without changing the exact name to select', () => {
  const topics = extractTopicNames(sample);
  assert.deepEqual(matchingTopics(topics, 'ToPiC'), ['/topic50', 'topic1', 'topic2']);
  assert.deepEqual(matchingTopics(topics, 'global/rfq'), ['SOW/GLOBAL/RFQ']);
  assert.deepEqual(matchingTopics(topics, ''), topics);
  assert.deepEqual(matchingTopics(topics, 'custom-new-topic'), []);
});

test('admin lookup performs a bounded read without forwarding credentials or following redirects', async () => {
  const topics = await fetchTopicNames('http://localhost:8085', async (input, init) => {
    assert.equal(input, 'http://localhost:8085/amps/instance/sow.json');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
    return Response.json(sample);
  });
  assert.deepEqual(topics, extractTopicNames(sample));
});

test('admin failures are reported without inventing or retaining topic suggestions', async () => {
  await assert.rejects(fetchTopicNames('http://localhost:8085', async () => { throw new Error('connection refused'); }), /Could not reach/);
  await assert.rejects(fetchTopicNames('http://localhost:8085', async () => new Response('', { status: 401 })), /requires authorization/);
  await assert.rejects(fetchTopicNames('http://localhost:8085', async () => new Response('', { status: 404 })), /HTTP 404/);
  await assert.rejects(fetchTopicNames('http://localhost:8085', async () => new Response('<html>not JSON</html>')), /valid JSON/);
  await assert.rejects(fetchTopicNames('http://localhost:8085', async () => new Response('x'.repeat(8 * 1024 * 1024 + 1))), /8 MB limit/);
});
