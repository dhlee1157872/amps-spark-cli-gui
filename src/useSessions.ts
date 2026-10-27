import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bootstrap, OutputEvent, Session, SessionUpdate } from '../shared/model';

export function useSessions() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [online, setOnline] = useState(true);
  const pending = useRef(new Map<string, OutputEvent[]>());
  const token = bootstrap?.token;
  const forgetSessions = useCallback((ids: string[]) => {
    const removed = new Set(ids);
    for (const id of ids) pending.current.delete(id);
    setSessions(items => items.filter(item => !removed.has(item.id)));
  }, []);
  const addSession = useCallback((session: Session) => {
    // HTTP creation and the live stream can arrive in either order.
    setSessions(items => items.some(item => item.id === session.id) ? items : [...items, session]);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/bootstrap', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('The local backend could not be reached.');
      const data: Bootstrap = await response.json();
      setBootstrap(data); setSessions(data.sessions);
    }).catch(error => { if (error.name !== 'AbortError') setBootError(error.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!token) return;
    const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    source.onopen = () => setOnline(true);
    source.onerror = () => setOnline(false);
    source.onmessage = message => {
      const update: SessionUpdate = JSON.parse(message.data);
      switch (update.type) {
        case 'snapshot': pending.current.clear(); setSessions(update.sessions); break;
        case 'session': addSession(update.session); break;
        case 'status': setSessions(items => items.map(item => item.id === update.session.id ? { ...item, ...update.session } : item)); break;
        case 'removed': forgetSessions([update.id]); break;
        case 'output': {
          const batch = pending.current.get(update.sessionId) || [];
          batch.push(update.event);
          pending.current.set(update.sessionId, batch.slice(-500));
        }
      }
    };
    const interval = setInterval(() => {
      if (!pending.current.size) return;
      const batches = new Map(pending.current); pending.current.clear();
      setSessions(items => items.map(session => {
        const entries = batches.get(session.id);
        if (!entries?.length) return session;
        return { ...session, totalEvents: Math.max(session.totalEvents, entries[entries.length - 1].id), events: [...session.events, ...entries.filter(event => !session.events.some(old => old.id === event.id))].slice(-500) };
      }));
    }, 100);
    return () => { source.close(); clearInterval(interval); pending.current.clear(); };
  }, [token, addSession, forgetSessions]);
  const api = useCallback(async (url: string, body: unknown = {}, method: 'POST' | 'DELETE' = 'POST') => {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Spark-Token': token || '' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The operation failed.');
    return data;
  }, [token]);
  return { bootstrap, bootError, sessions, online, forgetSessions, addSession, api };
}
export type SessionController = ReturnType<typeof useSessions>;
