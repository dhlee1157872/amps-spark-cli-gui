import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Clipboard, Code2, Download, Layers3, LoaderCircle, Play, Plus, Radio, Search, Send, Server, Settings2, Square, Terminal, Trash2, X, Zap, Activity, BookOpen, RotateCcw, ShieldCheck } from 'lucide-react';
import { commands, isActive, type Command, type Connection, type Option, type Session } from '../shared/model';
import { adminTopicsEndpoint } from '../shared/topics';
import TopicInput from './TopicInput';
import { useTopicDiscovery } from './useTopicDiscovery';
import ThemePicker from './ThemePicker';
import SessionOptions from './SessionOptions';
import { type Theme } from './theme';
import type { Workspace } from './workspaces';
import type { SessionController } from './useSessions';

const icons = { sow: Search, subscribe: Radio, publish: Send, sow_and_subscribe: Layers3, ping: Activity, latency: Activity, sow_delete: Trash2, log_replay: RotateCcw, help: BookOpen };
const clock = (time: string) => new Date(time).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const activeLabel = (state: Session['state']) => ({ starting: 'Starting', running: 'Running', stopping: 'Stopping', completed: 'Completed', stopped: 'Stopped', failed: 'Failed' })[state];

function Logo() { return <div className="brand"><span className="brand-mark"><Zap size={21} fill="currentColor" /></span><strong>spark<span className="brand-slash"> /</span></strong><span className="brand-sub">workbench</span></div>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>; }

interface Props {
  workspace: Workspace;
  visible: boolean;
  controller: SessionController;
  theme: Theme;
  changeTheme: (theme: Theme) => void;
  onOpen: (id: string, connection: Connection) => void;
  onBusy: (id: string, busy: boolean) => void;
}
export default function Workbench({ workspace, visible, controller, theme, changeTheme, onOpen, onBusy }: Props) {
  const { bootstrap, bootError, sessions, online, api, addSession, forgetSessions } = controller;
  const [connection, setConnection] = useState<Connection>(workspace.connection);
  const [entered, setEntered] = useState(workspace.entered);
  const [removing, setRemoving] = useState<string[]>([]);
  const [clearingSessions, setClearingSessions] = useState(false);
  const [selected, setSelected] = useState<string | null>(sessions.at(-1)?.id ?? null);
  const [command, setCommand] = useState<Command>('sow');
  const [topic, setTopic] = useState('');
  const [filter, setFilter] = useState('');
  const [topn, setTopn] = useState('100');
  const [options, setOptions] = useState<Option[]>([]);
  const [helpCommand, setHelpCommand] = useState('');
  const [message, setMessage] = useState('{\n  "id": 1\n}');
  const [format, setFormat] = useState('json');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [outputMode, setOutputMode] = useState<'all' | 'stdout' | 'stderr'>('all');
  const [cleared, setCleared] = useState<Record<string, number>>({});
  const [follow, setFollow] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const token = bootstrap?.token;
  const topicDiscovery = useTopicDiscovery(connection.server, connection.adminUrl || '', token, entered);
  const session = sessions.find(s => s.id === selected);
  const active = sessions.filter(s => isActive(s.state));
  const finishedCount = sessions.length - active.length;
  const definition = commands[command];
  const hasFilter = ['sow', 'subscribe', 'sow_and_subscribe', 'sow_delete'].includes(command);
  const currentPublisher = session?.command === 'publish' && session.state === 'running';

  const sessionIds = sessions.map(s => s.id).join(',');
  useEffect(() => {
    setSelected(current => current && !sessions.some(s => s.id === current) ? sessions.at(-1)?.id ?? null : current);
    setCleared(current => Object.fromEntries(Object.entries(current).filter(([id]) => sessions.some(session => session.id === id))));
  }, [sessionIds]);
  useEffect(() => { onBusy(workspace.id, busy || sending || clearingSessions || removing.length > 0); }, [workspace.id, busy, sending, clearingSessions, removing.length, onBusy]);
  useEffect(() => { if (follow && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [session?.events.length, session?.totalEvents, selected, follow, visible]);
  useEffect(() => { if (notice) { const timeout = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timeout); } }, [notice]);

  function choose(next: Command) { setCommand(next); setError(''); setOptions([]); setAdvanced(false); setSelected(null); setOutputMode('all'); }
  async function run(confirmDelete = false, override?: Command) {
    const selectedCommand = override || command;
    if (selectedCommand === 'sow_delete' && !confirmDelete) { setShowDelete(true); return; }
    setBusy(true); setError(''); setShowDelete(false);
    try {
      const result: Session = await api('/api/sessions', { workspaceId: workspace.id, command: selectedCommand, connection, topic, filter: ['sow', 'subscribe', 'sow_and_subscribe', 'sow_delete'].includes(selectedCommand) ? filter : '', topn, options: override ? [] : options, helpCommand: override === 'help' ? command : helpCommand, confirmDelete });
      addSession(result); setSelected(result.id); setFollow(true); setOutputMode('all');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function stop(id: string) { try { await api(`/api/sessions/${id}/stop`); } catch (e) { setError((e as Error).message); } }
  async function removeSession(id: string) {
    if (removing.includes(id)) return;
    setRemoving(ids => [...ids, id]); setError('');
    try {
      const result: { removed: string[] } = await api(`/api/sessions/${id}`, {}, 'DELETE');
      forgetSessions(result.removed); setNotice('Session removed');
    } catch (e) { setError((e as Error).message); }
    finally { setRemoving(ids => ids.filter(item => item !== id)); }
  }
  async function clearFinishedSessions() {
    setClearingSessions(true); setError('');
    try {
      const result: { removed: string[] } = workspace.id === 'legacy'
        ? { removed: (await Promise.all(sessions.filter(item => !isActive(item.state)).map(item => api(`/api/sessions/${item.id}`, {}, 'DELETE')))).flatMap(item => item.removed) }
        : await api('/api/sessions/clear-finished', { workspaceId: workspace.id });
      forgetSessions(result.removed);
      setNotice(result.removed.length ? `${result.removed.length} finished session${result.removed.length === 1 ? '' : 's'} cleared` : 'No finished sessions to clear');
    } catch (e) { setError((e as Error).message); }
    finally { setClearingSessions(false); }
  }
  async function send() {
    if (!session || sending) return;
    setSending(true); setError('');
    try { await api(`/api/sessions/${session.id}/input`, { message, format }); setNotice('Message written to Spark'); }
    catch (e) { setError((e as Error).message); } finally { setSending(false); }
  }
  const output = (session?.events || []).filter(e => e.id > (cleared[session!.id] || 0) && (outputMode === 'all' || e.kind === outputMode));
  const outputText = output.map(e => `[${clock(e.time)}] [${e.kind}] ${e.text}`).join('\n');
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice('Copied to clipboard'); } catch { setError('Clipboard access was denied by your browser.'); } }
  function download() { const url = URL.createObjectURL(new Blob([outputText], { type: 'text/plain' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `spark-${session?.command || 'output'}-${Date.now()}.txt`; anchor.click(); URL.revokeObjectURL(url); }
  function enter(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!/^(?:[a-zA-Z0-9_.-]+|\[[0-9a-fA-F:]+\]):\d{1,5}$/.test(connection.server.trim())) { setError('Use hostname:port, for example localhost:9007.'); return; }
    if (connection.adminUrl?.trim()) {
      try { adminTopicsEndpoint(connection.adminUrl); } catch (error) { setError((error as Error).message); return; }
    }
    const next = { ...connection, server: connection.server.trim(), name: connection.name.trim() || connection.server.trim(), adminUrl: connection.adminUrl?.trim() || '' };
    setConnection(next); setEntered(true);
    onOpen(workspace.id, next);
  }
  const updateConnection = (key: keyof Connection, value: string | boolean) => setConnection(c => ({ ...c, [key]: value }));

  if (!entered) return <div className="entry-page">
    <header className="entry-header"><Logo /><ThemePicker value={theme} onChange={changeTheme} /></header>
    <main className="entry-main">
      <div className="connection-heading">
        <div><div className="eyebrow">{workspace.entered ? 'WORKSPACE SETTINGS' : 'NEW WORKSPACE'}</div><h1>Server connection</h1><p>Choose the AMPS server for this workspace.</p></div>
        <span className="spark-availability" role="status"><span className={`dot ${bootstrap?.spark.ready ? '' : 'neutral'}`} />{bootstrap ? bootstrap.spark.ready ? 'Spark CLI available' : 'Spark setup needed' : bootError ? 'Backend unavailable' : 'Checking local backend'}</span>
      </div>
      <section className="connection-card" aria-label="Server connection settings">
        <form onSubmit={enter}>
          <div className="connection-destination">
            <Field label="Server address" hint="hostname:port"><div className="input-with-icon"><Server size={19} /><input required disabled={active.length > 0} value={connection.server} onChange={e => updateConnection('server', e.target.value)} placeholder="localhost:9007" autoComplete="off" spellCheck={false} /></div></Field>
            <div className="connection-fields">
              <Field label="Message type"><input disabled={active.length > 0} value={connection.type} onChange={e => updateConnection('type', e.target.value)} placeholder="json" /></Field>
              <Field label="Protocol"><select disabled={active.length > 0} value={connection.proto} onChange={e => updateConnection('proto', e.target.value)}>{['amps', 'fix', 'nvfix', 'xml'].map(p => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Workspace name" hint="Optional"><input value={connection.name} onChange={e => updateConnection('name', e.target.value)} placeholder="e.g. Local development" autoComplete="off" /></Field>
            </div>
          </div>
          <div className="connection-sections">
            <details className="connection-advanced">
              <summary><ShieldCheck size={17} /><span className="connection-section-label">Authentication & security<small>Credentials and TLS</small></span><ChevronDown size={15} /></summary>
              <div className="connection-section-body"><div className="field-row"><Field label="Username"><input value={connection.username} onChange={e => updateConnection('username', e.target.value)} autoComplete="username" /></Field><Field label="Password"><input type="password" value={connection.password} onChange={e => updateConnection('password', e.target.value)} autoComplete="current-password" /></Field></div><label className="checkbox"><input type="checkbox" disabled={active.length > 0} checked={connection.secure} onChange={e => updateConnection('secure', e.target.checked)} /> Use a secure connection (TLS)</label><small className="muted">Passwords stay in memory and are never saved in browser storage.</small></div>
            </details>
            <details className="connection-advanced topic-discovery-settings" open={connection.adminUrl ? true : undefined}>
              <summary><Radio size={17} /><span className="connection-section-label">Topic discovery<small>Suggest topic names from an admin endpoint</small></span><span className="optional-label">Optional</span><ChevronDown size={15} /></summary>
              <div className="connection-section-body"><Field label="Admin URL"><input type="url" value={connection.adminUrl || ''} onChange={e => updateConnection('adminUrl', e.target.value)} placeholder="http://localhost:8085" autoComplete="off" spellCheck={false} aria-describedby={`admin-url-hint-${workspace.id}`} /></Field><small className="muted" id={`admin-url-hint-${workspace.id}`}>Use the admin base URL or the full /amps/instance/sow.json endpoint. Enable the HTTP admin port on your AMPS server first. Manual topic entry always works.</small></div>
            </details>
          </div>
          {(active.length > 0 || error || bootError) && <div className="connection-feedback">
            {active.length > 0 && <small className="muted">Sessions keep running while you update credentials or topic discovery. Stop this workspace’s active sessions to change its server, protocol, message type, or TLS.</small>}
            {(error || bootError) && <div className="error" role="alert">{error || bootError}</div>}
          </div>}
          <div className="connection-actions">
            <p><Terminal size={15} /><span>{connection.adminUrl?.trim() ? 'Loads topic names on open. Spark starts when you run a command.' : 'Spark connects when you run a command.'}</span></p>
            <div>{workspace.entered && <button className="button subtle" type="button" onClick={() => { setConnection(workspace.connection); setEntered(true); setError(''); }}>Cancel</button>}<button className="button primary entry-submit" type="submit">{workspace.entered ? 'Save settings' : 'Open workspace'} <ArrowRight size={16} /></button></div>
          </div>
        </form>
      </section>
    </main>
  </div>;

  return <div className="app-shell">
    <aside className="sidebar"><Logo /><div className="workspace-label">WORKSPACE</div><button className="server-card" disabled={busy} onClick={() => setEntered(false)} title="Workspace settings"><span className="server-icon"><Server size={19} /></span><span><strong>{connection.name}</strong><small>{connection.server}</small></span><ChevronDown size={14} /></button>
      <div className="workspace-label command-heading">COMMANDS</div><nav aria-label="Spark commands">{(['sow', 'subscribe', 'publish', 'sow_and_subscribe', 'sow_delete'] as Command[]).map(key => { const Icon = icons[key]; return <button key={key} onClick={() => choose(key)} className={`nav-item ${command === key ? 'selected' : ''}`}><Icon size={18} /><span>{commands[key].label}</span>{command === key && <span className="nav-dot" />}</button>; })}
        <div className="workspace-label utilities-label">UTILITIES</div>{(['ping', 'latency', 'log_replay', 'help'] as Command[]).map(key => { const Icon = icons[key]; return <button key={key} onClick={() => choose(key)} className={`nav-item ${command === key ? 'selected' : ''}`}><Icon size={17} /><span>{commands[key].label}</span></button>; })}</nav>
      <div className="sidebar-bottom"><div className="local-indicator"><span className={`dot ${online ? '' : 'neutral'}`} /><span>{online ? 'Local workspace' : 'Reconnecting'}</span><span className="version">v0.1</span></div><p>Small commands.<br />A clearer picture.</p></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumbs">Workspace <ChevronRight size={14} /><span>{definition.label}</span></div><div className="topbar-right"><button className="icon-button" disabled={busy} aria-label="Workspace settings" title="Workspace settings" onClick={() => setEntered(false)}><Settings2 size={16} /></button><ThemePicker value={theme} onChange={changeTheme} /><span className="protocol-tag">{connection.secure ? 'TLS' : 'TCP'} <span>/</span> {connection.type || connection.proto}</span><span className="server-tag"><Server size={14} />{connection.server}</span></div></header>
      <main className="work-main"><div className="page-heading"><div><div className="eyebrow">{definition.eyebrow}</div><h1>{definition.title}</h1><p>{definition.description}</p></div><button className="button subtle help-button" disabled={busy || !bootstrap?.spark.ready} onClick={() => run(false, 'help')}><CircleHelp size={16} /> CLI reference</button></div>
        {(!bootstrap?.spark.ready || bootError) && <div className="setup-banner"><Terminal size={19} /><div><strong>{bootError ? 'Local backend unavailable' : 'Bring your Spark CLI'}</strong><p>{bootError || bootstrap?.spark.error || 'Checking your local installation…'}</p><code>SPARK_BIN=./tools/spark/bin/spark npm run dev</code></div></div>}
        {!online && <div className="error" role="status">Output connection lost. Reconnecting automatically; sessions stop after 30 seconds without a viewer.</div>}
        <section className="command-card"><div className="section-heading"><span><Settings2 size={16} /> Command configuration</span><code>spark {command}</code></div><form onSubmit={e => { e.preventDefault(); run(); }}>
          <div className="command-fields">{definition.topic && <TopicInput value={topic} onChange={setTopic} discovery={topicDiscovery} />}
            {hasFilter && <Field label="Filter" hint={command === 'sow_delete' ? 'Required' : 'Optional'}><input required={command === 'sow_delete'} value={filter} onChange={e => setFilter(e.target.value)} placeholder="e.g. /id = 1" spellCheck={false} /></Field>}
            {['sow', 'sow_and_subscribe'].includes(command) && <Field label="Result limit"><input type="number" min="0" max="100000" value={topn} onChange={e => setTopn(e.target.value)} /></Field>}
            {command === 'help' && <Field label="Command"><select value={helpCommand} onChange={e => setHelpCommand(e.target.value)}><option value="">All commands</option>{Object.keys(commands).filter(c => c !== 'help').map(c => <option key={c}>{c}</option>)}</select></Field>}
            {['ping', 'latency', 'log_replay'].includes(command) && <p className="utility-description">Uses <code>{connection.server}</code>. Add command-specific flags below, or open the CLI reference for your installed version.</p>}
          </div>
          {command !== 'help' && <><button className="advanced-toggle" type="button" onClick={() => setAdvanced(v => !v)}><ChevronRight size={14} className={advanced ? 'rotated' : ''} /> Advanced options {options.length > 0 && <span className="count-pill">{options.length}</span>}</button>{advanced && <div className="advanced-panel"><p>Pass additional flags directly to Spark. Connection fields are managed above.</p>{options.map((option, index) => <div className="option-row" key={index}><input aria-label={`Option ${index + 1} name`} placeholder="bookmark" value={option.flag} onChange={e => setOptions(items => items.map((o, i) => i === index ? { ...o, flag: e.target.value } : o))} /><input aria-label={`Option ${index + 1} value`} placeholder="Value (optional for flags)" value={option.value} onChange={e => setOptions(items => items.map((o, i) => i === index ? { ...o, value: e.target.value } : o))} /><button className="icon-button" type="button" aria-label="Remove option" onClick={() => setOptions(items => items.filter((_, i) => i !== index))}><X size={16} /></button></div>)}<button type="button" className="button subtle small" onClick={() => setOptions(items => [...items, { flag: '', value: '' }])}><Plus size={14} /> Add option</button></div>}</>}
          <div className="command-actions"><span><span className="dot neutral" /> {active.length ? `${active.length} active session${active.length > 1 ? 's' : ''}` : 'Ready when you are'}</span><button className={`button ${command === 'sow_delete' ? 'danger' : 'primary'}`} disabled={busy || !bootstrap?.spark.ready || (definition.topic && !topic.trim()) || (command === 'sow_delete' && !filter.trim())}>{busy ? <LoaderCircle size={16} className="spin" /> : <Play size={14} fill="currentColor" />}{definition.action}</button></div>
        </form></section>
        {error && <div className="error dismissible" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        <div className="results-heading"><div><h2>Session output</h2><span>{sessions.length ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} this run` : 'Your results, in one place'}</span></div><div className="session-list-actions"><span className="live-hint"><span className={`dot ${active.length ? '' : 'neutral'}`} /> {active.length ? 'Live updates' : 'Awaiting a command'}</span>{sessions.length > 0 && <button className="button subtle small" title="Remove completed, stopped, and failed sessions; keep running sessions" disabled={!finishedCount || clearingSessions} onClick={clearFinishedSessions}>{clearingSessions ? <LoaderCircle size={13} className="spin" /> : <Trash2 size={13} />}Clear finished{finishedCount > 0 && <span className="count-pill">{finishedCount}</span>}</button>}</div></div>
        {sessions.length > 0 && <div className="session-tabs" role="tablist" aria-label="Sessions">{sessions.map((s, index) => <div role="presentation" key={s.id} className={`session-tab-group ${selected === s.id ? 'active' : ''}`}><button role="tab" aria-selected={selected === s.id} onClick={() => { setSelected(s.id); setFollow(true); }}><span className={`session-dot ${s.state}`} />{commands[s.command].label}<span className="session-number">{String(index + 1).padStart(2, '0')}</span></button><button className="session-close" disabled={removing.includes(s.id) || clearingSessions} aria-label={`${isActive(s.state) ? 'Stop and remove' : 'Remove'} ${commands[s.command].label} session ${index + 1}`} title={isActive(s.state) ? 'Stop and remove session' : 'Remove session'} onClick={() => removeSession(s.id)}>{removing.includes(s.id) ? <LoaderCircle size={12} className="spin" /> : <X size={12} />}</button></div>)}</div>}
        {session?.command === 'publish' && <section className="composer"><div className="section-heading"><span><Code2 size={16} /> Message composer <code>{session.topic}</code></span><select aria-label="Message format" value={format} onChange={e => setFormat(e.target.value)}><option value="json">JSON</option><option value="text">Plain text</option></select></div><textarea aria-label="Message payload" value={message} onChange={e => setMessage(e.target.value)} spellCheck={false} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (currentPublisher) send(); } }} /><div className="composer-footer"><span>{currentPublisher ? 'Send multiple messages through this publisher.' : 'This publisher is no longer running.'}<kbd>Ctrl ↵</kbd></span><button className="button primary small" disabled={!currentPublisher || sending || !message.trim()} onClick={send}><Send size={14} />{sending ? 'Sending…' : 'Send message'}</button></div></section>}
        <section className="output-card">
          {session && commands[session.command].topic && session.topic && <div className="output-topic"><Radio size={14} aria-hidden="true" /><span>Topic</span><code>{session.topic}</code></div>}
          <div className="output-toolbar"><div className="output-filters">{(['all', 'stdout', 'stderr'] as const).map(mode => <button className={outputMode === mode ? 'selected' : ''} key={mode} onClick={() => setOutputMode(mode)}>{mode === 'all' ? 'All activity' : mode === 'stdout' ? 'Output' : 'Errors'}</button>)}</div><div className="output-tools"><button className={`icon-button ${follow ? 'on' : ''}`} aria-label={follow ? 'Disable auto-scroll' : 'Enable auto-scroll'} title="Auto-scroll" onClick={() => setFollow(v => !v)}><ArrowDown size={15} /></button><button className="icon-button" title="Copy output" aria-label="Copy output" disabled={!output.length} onClick={() => copy(outputText)}><Clipboard size={15} /></button><button className="icon-button" title="Download output" aria-label="Download output" disabled={!output.length} onClick={download}><Download size={15} /></button><button className="icon-button" title="Clear display" aria-label="Clear display" disabled={!session} onClick={() => session && setCleared(v => ({ ...v, [session.id]: session.totalEvents }))}><Trash2 size={15} /></button>{session && isActive(session.state) && <button className="button stop-button small" disabled={session.state === 'stopping'} onClick={() => stop(session.id)}><Square size={11} fill="currentColor" /> Stop</button>}</div></div>
          {session && <SessionOptions session={session} />}
          <div className="output-body" ref={outputRef} tabIndex={0} aria-label="Spark output">{output.length ? output.map(event => <div className={`output-line ${event.kind}`} key={event.id}><span className="output-time">{clock(event.time)}</span><span className="output-kind">{event.kind === 'stdout' ? 'OUT' : event.kind === 'stderr' ? 'ERR' : event.kind === 'sent' ? 'IN' : 'SYS'}</span><pre>{event.text}</pre></div>) : <div className="empty-output"><span className="empty-terminal"><Terminal size={29} /></span><h3>{session ? 'A quiet moment.' : 'Ready for your first command.'}</h3><p>{session ? 'Output will appear here as Spark writes it. Try All activity to see session events.' : 'Configure a command above and run it.\nThe response from Spark will appear right here.'}</p><span className="empty-shortcut"><span className="dot neutral" /> {session ? activeLabel(session.state) : 'No session started'}</span></div>}</div>
          <div className="output-status"><span>{session ? <><span className={`session-dot ${session.state}`} />{activeLabel(session.state)}<span className="status-divider">/</span>{session.events.length} retained entries{session.totalEvents > 500 && <span> · older output discarded</span>}</> : <><Terminal size={13} /> Spark CLI output</>}</span><span>{session ? `Started ${clock(session.createdAt)}` : 'Nothing runs until you say so.'}</span></div>
        </section>
        {session && <div className="command-preview"><Terminal size={14} /><code>{session.preview}</code><button className="icon-button" aria-label="Copy command" title="Copy command (credentials redacted)" onClick={() => copy(session.preview)}><Clipboard size={14} /></button></div>}
        <footer className="workspace-footer"><span><ShieldCheck size={13} /> Runs locally. Powered by Spark.</span><span>AMPS / DEVELOPER TOOLS</span></footer>
      </main>
    </div>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    {showDelete && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby={`delete-title-${workspace.id}`}><span className="danger-icon"><Trash2 size={24} /></span><h2 id={`delete-title-${workspace.id}`}>Delete matching records?</h2><p>This runs <code>sow_delete</code> on <strong>{connection.server}</strong>. This action changes server data.</p><dl><dt>Topic</dt><dd>{topic}</dd><dt>Filter</dt><dd>{filter}</dd></dl><div className="modal-actions"><button className="button subtle" autoFocus onClick={() => setShowDelete(false)}>Cancel</button><button className="button danger" onClick={() => run(true)}>Delete records</button></div></section></div>}
  </div>;
}
