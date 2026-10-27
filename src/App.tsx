import { useCallback, useEffect, useState } from 'react';
import { Layers3, LoaderCircle, Plus, Server, Trash2, X, Zap } from 'lucide-react';
import { isActive, type Connection } from '../shared/model';
import Workbench from './Workbench';
import { useSessions } from './useSessions';
import { applyTheme, readTheme, type Theme } from './theme';
import { newWorkspace, readWorkspaces, restoreWorkspaces, serializeWorkspaces, sessionWorkspaceId } from './workspaces';

export default function App() {
  const controller = useSessions();
  const [store, setStore] = useState(() => readWorkspaces({ getItem: key => localStorage.getItem(key) }));
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [closeId, setCloseId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const sessionIds = controller.sessions.map(session => session.id).join(',');
  useEffect(() => {
    if (!controller.bootstrap) return;
    setStore(current => restoreWorkspaces(current, controller.sessions));
    setReady(true);
  }, [controller.bootstrap, sessionIds]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem('spark.workspaces', serializeWorkspaces(store)); } catch { /* Storage is optional. */ }
  }, [store, ready]);
  const onOpen = useCallback((id: string, connection: Connection) => {
    setStore(current => ({ ...current, workspaces: current.workspaces.map(workspace => workspace.id === id ? { ...workspace, entered: true, connection } : workspace) }));
  }, []);
  const onBusy = useCallback((id: string, value: boolean) => setBusy(current => current[id] === value ? current : { ...current, [id]: value }), []);
  function changeTheme(next: Theme) {
    setTheme(next); applyTheme(next);
    try { localStorage.setItem('spark.theme', next); } catch { /* Storage is optional. */ }
  }
  function addWorkspace() {
    const workspace = newWorkspace();
    setStore(current => ({ workspaces: [...current.workspaces, workspace], selected: workspace.id }));
  }
  const closingWorkspace = store.workspaces.find(workspace => workspace.id === closeId);
  const closingSessions = controller.sessions.filter(session => sessionWorkspaceId(session) === closeId);
  async function closeWorkspace() {
    if (!closeId || closing || busy[closeId]) return;
    setClosing(true); setError('');
    try {
      // Await every cleanup, including failures, before re-enabling this workspace.
      const results = await Promise.allSettled(closingSessions.map(async session => {
        const result: { removed: string[] } = await controller.api(`/api/sessions/${session.id}`, {}, 'DELETE');
        controller.forgetSessions(result.removed);
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      setStore(current => {
        const remaining = current.workspaces.filter(workspace => workspace.id !== closeId);
        if (!remaining.length) remaining.push(newWorkspace());
        return { workspaces: remaining, selected: current.selected === closeId ? remaining[0].id : current.selected };
      });
      setCloseId(null);
    } catch (error) { setError((error as Error).message); }
    finally { setClosing(false); }
  }
  if (!ready) return <main className="workspace-loading"><Zap size={30} /><h1>Spark Workbench</h1>{controller.bootError ? <div className="error" role="alert">{controller.bootError} Refresh the page to retry.</div> : <p><LoaderCircle className="spin" size={16} /> Loading your workspaces…</p>}</main>;
  return <div className="multi-workspace">
    <nav className="workspace-strip" aria-label="Workspaces" inert={Boolean(closeId)}>
      <span className="workspace-strip-label"><Layers3 size={16} /> WORKSPACES</span>
      <div className="workspace-switcher">
        {store.workspaces.map(workspace => {
          const active = controller.sessions.filter(session => sessionWorkspaceId(session) === workspace.id && isActive(session.state)).length;
          return <div className={`workspace-tab ${store.selected === workspace.id ? 'selected' : ''}`} key={workspace.id}>
            <button className="workspace-tab-select" aria-current={store.selected === workspace.id ? 'page' : undefined} aria-controls={`workspace-${workspace.id}`} title={`${workspace.connection.name || 'New workspace'} · ${workspace.connection.server}${active ? ` · ${active} running` : ''}`} onClick={() => setStore(current => ({ ...current, selected: workspace.id }))}>
              <Server size={14} /><span><strong>{workspace.connection.name || 'New workspace'}</strong><small>{workspace.entered ? workspace.connection.server : 'Set up connection'}</small></span>
              {active > 0 && <span className="workspace-live" aria-label={`${active} active sessions`}><span className="dot" />{active}</span>}
            </button>
            <button className="icon-button workspace-tab-close" disabled={busy[workspace.id] || closing} aria-label={`Close ${workspace.connection.name || 'new workspace'}`} title="Close workspace" onClick={() => { setCloseId(workspace.id); setError(''); }}><X size={13} /></button>
          </div>;
        })}
      </div>
      <button className="button subtle small workspace-add" aria-label="New workspace" disabled={closing} onClick={addWorkspace}><Plus size={15} /><span>New workspace</span></button>
    </nav>
    {store.workspaces.map(workspace => <div key={workspace.id} id={`workspace-${workspace.id}`} className="workspace-pane" hidden={store.selected !== workspace.id} inert={Boolean(closeId)}>
      <Workbench workspace={workspace} visible={store.selected === workspace.id} controller={{ ...controller, sessions: controller.sessions.filter(session => sessionWorkspaceId(session) === workspace.id) }} theme={theme} changeTheme={changeTheme} onOpen={onOpen} onBusy={onBusy} />
    </div>)}
    {closingWorkspace && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="close-workspace-title"><span className="danger-icon"><Trash2 size={24} /></span><h2 id="close-workspace-title">Close {closingWorkspace.connection.name || 'this workspace'}?</h2><p>This removes its saved profile and {closingSessions.length} session{closingSessions.length === 1 ? '' : 's'}. {closingSessions.some(session => isActive(session.state)) ? 'Running Spark processes in this workspace will stop first. ' : ''}Your other workspaces stay open.</p>{error && <div className="error" role="alert">{error}</div>}<div className="modal-actions"><button className="button subtle" autoFocus disabled={closing} onClick={() => setCloseId(null)}>Cancel</button><button className="button danger" disabled={closing || busy[closingWorkspace.id]} onClick={closeWorkspace}>{closing && <LoaderCircle className="spin" size={15} />}{closing ? 'Closing…' : 'Close workspace'}</button></div></section></div>}
  </div>;
}
