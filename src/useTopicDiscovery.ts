import { useEffect, useState } from 'react';

export interface TopicDiscovery { topics: string[]; loading: boolean; error: string; enabled: boolean; refresh: () => void }

export function useTopicDiscovery(server: string, adminUrl: string, token: string | undefined, entered: boolean): TopicDiscovery {
  const key = JSON.stringify([server, adminUrl]);
  const enabled = entered && Boolean(adminUrl.trim());
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key: '', topics: [] as string[], loading: false, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, topics: [], loading: enabled, error: '' });
    if (enabled && token) {
      fetch('/api/topics', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Spark-Token': token },
        body: JSON.stringify({ adminUrl }),
      }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Topic discovery is unavailable.');
        if (!Array.isArray(data.topics) || !data.topics.every((topic: unknown) => typeof topic === 'string')) throw new Error('Invalid topic discovery response.');
        if (!controller.signal.aborted) setState({ key, topics: data.topics, loading: false, error: '' });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ key, topics: [], loading: false, error: error instanceof SyntaxError ? 'Restart the local backend to enable topic discovery.' : error.message });
      });
    }
    return () => controller.abort();
  }, [key, adminUrl, token, enabled, revision]);
  const current = state.key === key ? state : { topics: [], loading: enabled, error: '' };
  return { ...current, enabled, refresh: () => setRevision(value => value + 1) };
}
