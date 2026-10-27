export function adminTopicsEndpoint(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) throw new Error('Enter an admin URL, such as http://localhost:8085.');
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Use a complete admin URL starting with http:// or https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('The admin URL must use HTTP or HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Use an admin URL without credentials, query parameters, or a fragment.');
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/amps/instance/sow.json')) url.pathname = pathname;
  else if (pathname.endsWith('/amps/instance')) url.pathname = `${pathname}/sow.json`;
  else if (pathname.endsWith('/amps')) url.pathname = `${pathname}/instance/sow.json`;
  else url.pathname = `${pathname}/amps/instance/sow.json`;
  return url.href;
}

export function matchingTopics(topics: string[], input: string): string[] {
  const query = input.toLocaleLowerCase();
  return topics.filter(topic => topic.toLocaleLowerCase().includes(query));
}
