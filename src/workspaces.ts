import type { Connection, Session } from '../shared/model';

export const initialConnection: Connection = { name: 'Local development', server: 'localhost:9007', username: '', password: '', proto: 'amps', type: 'json', secure: false, adminUrl: '' };
export interface Workspace { id: string; connection: Connection; entered: boolean }
export interface WorkspaceStore { workspaces: Workspace[]; selected: string }
export const sessionWorkspaceId = (session: Session) => session.workspaceId || 'legacy';
export function newWorkspace(connection: Connection = { ...initialConnection, name: '' }): Workspace {
  return { id: crypto.randomUUID(), connection: { ...connection }, entered: false };
}
export function readWorkspaces(storage: Pick<Storage, 'getItem'>): WorkspaceStore {
  try {
    const saved = JSON.parse(storage.getItem('spark.workspaces') || 'null');
    if (Array.isArray(saved?.workspaces)) {
      const ids = new Set<string>();
      const workspaces: Workspace[] = [];
      for (const item of saved.workspaces) {
        if (typeof item?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id) || typeof item.connection?.server !== 'string') continue;
        ids.add(item.id);
        workspaces.push({ id: item.id, connection: { ...initialConnection, ...item.connection, password: '' }, entered: true });
      }
      if (workspaces.length) return { workspaces, selected: ids.has(saved.selected) ? saved.selected : workspaces[0].id };
    }
    const legacy = JSON.parse(storage.getItem('spark.connection') || 'null');
    const workspace = newWorkspace(legacy?.server ? { ...initialConnection, ...legacy, password: '' } : initialConnection);
    return { workspaces: [workspace], selected: workspace.id };
  } catch {
    const workspace = newWorkspace(initialConnection);
    return { workspaces: [workspace], selected: workspace.id };
  }
}
export function serializeWorkspaces(store: WorkspaceStore) {
  return JSON.stringify({ selected: store.selected, workspaces: store.workspaces.filter(w => w.entered).map(w => ({ ...w, connection: { ...w.connection, password: '' } })) });
}
export function restoreWorkspaces(store: WorkspaceStore, sessions: Session[]): WorkspaceStore {
  const workspaces = [...store.workspaces];
  for (const session of sessions) {
    const id = sessionWorkspaceId(session);
    if (workspaces.some(w => w.id === id)) continue;
    const value = (flag: string) => session.options?.find(option => option.flag === flag)?.value;
    workspaces.push({ id, entered: true, connection: {
      ...initialConnection, name: session.workspaceName || session.server || 'Restored workspace', server: session.server,
      proto: value('proto') || initialConnection.proto, type: value('type') || initialConnection.type,
      secure: value('secure') === 'true',
    } });
  }
  return { ...store, workspaces };
}
