import { adminTopicsEndpoint } from '../shared/topics.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function extractTopicNames(payload: unknown): string[] {
  const rows = record(record(record(payload)?.amps)?.instance)?.sow;
  if (!Array.isArray(rows)) throw new Error('The admin response does not contain amps.instance.sow. Check the admin URL.');
  const names = rows.map(row => record(row)?.topic);
  if (names.some(name => typeof name !== 'string' || !name.length)) throw new Error('The admin response contains an invalid topic name.');
  return [...new Set(names as string[])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// This is deliberately a topic-name lookup, not a proxy for arbitrary admin data.
export async function fetchTopicNames(adminUrl: unknown, request: typeof fetch = fetch): Promise<string[]> {
  const endpoint = adminTopicsEndpoint(adminUrl);
  const maximumBytes = 8 * 1024 * 1024;
  const signal = AbortSignal.timeout(5000);
  let response: Response;
  try { response = await request(endpoint, { headers: { Accept: 'application/json' }, redirect: 'error', signal }); }
  catch {
    throw new Error(signal.aborted ? 'The admin endpoint timed out. You can still type a topic manually.' : 'Could not reach the admin endpoint. Check the URL and that the AMPS HTTP admin port is enabled.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 || response.status === 403 ? 'The admin endpoint requires authorization. Admin authentication is not configured in this version.' : `The admin endpoint returned HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The admin endpoint returned an empty response.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) throw new Error('The admin response exceeds the 8 MB limit.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (signal.aborted) throw new Error('The admin endpoint timed out. You can still type a topic manually.');
    throw error;
  } finally { reader.releaseLock(); }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('The admin endpoint did not return valid JSON.'); }
  return extractTopicNames(payload);
}
