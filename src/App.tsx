import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Clipboard, Code2, Download, Layers3, LoaderCircle, Play, Plus, Radio, Search, Send, Server, Settings2, Square, Terminal, Trash2, X, Zap, Activity, BookOpen, RotateCcw, ShieldCheck } from 'lucide-react';
import { commands, isActive, type Bootstrap, type Command, type Connection, type Option, type OutputEvent, type Session } from '../shared/model';
import { adminTopicsEndpoint } from '../shared/topics';
import TopicInput from './TopicInput';
import { useTopicDiscovery } from './useTopicDiscovery';
import ThemePicker from './ThemePicker';
import { applyTheme, readTheme, type Theme } from './theme';

const initialConnection: Connection = { name: 'Local development', server: 'localhost:9007', username: '', password: '', proto: 'amps', type: 'json', secure: false, adminUrl: '' };
function readConnection(): Connection {
  try { const saved = JSON.parse(localStorage.getItem('spark.connection') || 'null'); return saved?.server ? { ...initialConnection, ...saved, password: '' } : initialConnection; } catch { return initialConnection; }
}
const icons = { sow: Search, subscribe: Radio, publish: Send, sow_and_subscribe: Layers3, ping: Activity, latency: Activity, sow_delete: Trash2, log_replay: RotateCcw, help: BookOpen };
const clock = (time: string) => new Date(time).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const activeLabel = (state: Session['state']) => ({ starting: 'Starting', running: 'Running', stopping: 'Stopping', completed: 'Completed', stopped: 'Stopped', failed: 'Failed' })[state];

function Logo() { return <div className="brand"><span className="brand-mark"><Zap size={21} fill="currentColor" /></span><strong>spark<span className="brand-slash"> /</span></strong><span className="brand-sub">workbench</span></div>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>; }

export default function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  function changeTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem('spark.theme', next); } catch { /* Persistence is optional. */ }
  }
  const [connection, setConnection] = useState<Connection>(readConnection);
  const [entered, setEntered] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
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
  const [online, setOnline] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const streams = useRef(new Map<string, EventSource>());
  const pending = useRef(new Map<string, OutputEvent[]>());
  const token = bootstrap?.token;
  const topicDiscovery = useTopicDiscovery(connection.server, connection.adminUrl || '', token, entered);
  const session = sessions.find(s => s.id === selected);
  const active = sessions.filter(s => isActive(s.state));
  const definition = commands[command];
  const hasFilter = ['sow', 'subscribe', 'sow_and_subscribe', 'sow_delete'].includes(command);
  const currentPublisher = session?.command === 'publish' && session.state === 'running';

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/bootstrap', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('The local backend could not be reached.');
      const data: Bootstrap = await response.json();
      setBootstrap(data); setSessions(data.sessions);
      const running = data.sessions.find(s => isActive(s.state));
      if (running) {
        setSelected(running.id); setCommand(running.command); setTopic(running.topic); setEntered(true);
        setConnection(c => c.server === running.server ? c : { ...initialConnection, name: 'Restored session', server: running.server });
      }
    }).catch(e => { if (e.name !== 'AbortError') setBootError(e.message); });
    return () => controller.abort();
  }, []);
  const sessionIds = sessions.map(s => s.id).join(',');
  useEffect(() => {
    if (!token) return;
    for (const id of sessionIds.split(',').filter(Boolean)) {
      if (streams.current.has(id)) continue;
      const source = new EventSource(`/api/sessions/${id}/events?token=${encodeURIComponent(token)}`);
      streams.current.set(id, source);
      source.onopen = () => setOnline(true);
      source.onerror = () => setOnline(false);
      source.addEventListener('snapshot', e => {
        const snapshot: Session = JSON.parse(e.data);
        pending.current.delete(id);
        setSessions(items => items.map(s => s.id === id ? snapshot : s));
      });
      source.addEventListener('output', e => {
        const batch = pending.current.get(id) || [];
        batch.push(JSON.parse(e.data));
        pending.current.set(id, batch.slice(-500));
      });
      source.addEventListener('status', e => {
        const status = JSON.parse(e.data);
        setSessions(items => items.map(s => s.id === id ? { ...s, ...status } : s));
      });
    }
  }, [token, sessionIds]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (!pending.current.size) return;
      const batches = new Map(pending.current); pending.current.clear();
      setSessions(items => items.map(s => {
        const entries = batches.get(s.id);
        if (!entries?.length) return s;
        return { ...s, totalEvents: Math.max(s.totalEvents, entries[entries.length - 1].id), events: [...s.events, ...entries.filter(e => !s.events.some(old => old.id === e.id))].slice(-500) };
      }));
    }, 100);
    return () => { clearInterval(interval); for (const stream of streams.current.values()) stream.close(); streams.current.clear(); };
  }, []);
  useEffect(() => { if (follow && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [session?.events.length, session?.totalEvents, selected, follow]);
  useEffect(() => { if (notice) { const timeout = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timeout); } }, [notice]);

  async function api(url: string, body: unknown = {}) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Spark-Token': token || '' }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The operation failed.'); return data;
  }
  function choose(next: Command) { setCommand(next); setError(''); setOptions([]); setAdvanced(false); setSelected(null); setOutputMode('all'); }
  async function run(confirmDelete = false, override?: Command) {
    const selectedCommand = override || command;
    if (selectedCommand === 'sow_delete' && !confirmDelete) { setShowDelete(true); return; }
    setBusy(true); setError(''); setShowDelete(false);
    try {
      const result: Session = await api('/api/sessions', { command: selectedCommand, connection, topic, filter: ['sow', 'subscribe', 'sow_and_subscribe', 'sow_delete'].includes(selectedCommand) ? filter : '', topn, options: override ? [] : options, helpCommand: override === 'help' ? command : helpCommand, confirmDelete });
      setSessions(items => [...items, result]); setSelected(result.id); setFollow(true); setOutputMode('all');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function stop(id: string) { try { await api(`/api/sessions/${id}/stop`); } catch (e) { setError((e as Error).message); } }
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
    try { localStorage.setItem('spark.connection', JSON.stringify({ ...next, password: '' })); } catch { /* Storage is optional. */ }
  }
  const updateConnection = (key: keyof Connection, value: string | boolean) => setConnection(c => ({ ...c, [key]: value }));

  if (!entered) return <div className="entry-page">
    <header className="entry-header"><Logo /><div className="entry-header-actions"><ThemePicker value={theme} onChange={changeTheme} /><span className="version-tag">LOCAL WORKSPACE <span>v0.1</span></span></div></header>
    <main className="entry-main">
      <section className="entry-story"><div className="eyebrow"><span className="dot" /> THE AMPS TESTING TOOLKIT</div><h1>A little clarity.<br />For every <em>message.</em></h1><p>Your familiar Spark commands. A focused workspace to sow, subscribe, and test what’s happening on your AMPS server.</p>
        <div className="entry-note"><Terminal size={19} /><div><strong>Powered by the Spark CLI</strong><p>Every command runs through your local Spark installation.</p></div></div>
      </section>
      <section className="connection-card"><div className="card-top"><span className="icon-tile"><Server size={23} /></span><span className="step-label">01 / SELECT YOUR SERVER</span></div><h2>Where are we working?</h2><p>Set the destination for your command workspace.</p>
        <form onSubmit={enter}>
          <Field label="Workspace name" hint="Optional"><input value={connection.name} onChange={e => updateConnection('name', e.target.value)} placeholder="Local development" autoComplete="off" /></Field>
          <Field label="Server address"><div className="input-with-icon"><Server size={16} /><input required value={connection.server} onChange={e => updateConnection('server', e.target.value)} placeholder="localhost:9007" autoComplete="off" spellCheck={false} /></div></Field>
          <div className="field-row"><Field label="Message type"><input value={connection.type} onChange={e => updateConnection('type', e.target.value)} placeholder="json" /></Field><Field label="Protocol"><select value={connection.proto} onChange={e => updateConnection('proto', e.target.value)}>{['amps', 'fix', 'nvfix', 'xml'].map(p => <option key={p}>{p}</option>)}</select></Field></div>
          <details className="connection-advanced"><summary><Settings2 size={15} /> Authentication & security <ChevronDown size={15} /></summary><div className="field-row"><Field label="Username"><input value={connection.username} onChange={e => updateConnection('username', e.target.value)} autoComplete="username" /></Field><Field label="Password"><input type="password" value={connection.password} onChange={e => updateConnection('password', e.target.value)} autoComplete="current-password" /></Field></div><label className="checkbox"><input type="checkbox" checked={connection.secure} onChange={e => updateConnection('secure', e.target.checked)} /> Use a secure connection (TLS)</label><small className="muted">Passwords stay in memory and are never saved in browser storage.</small></details>
          <details className="connection-advanced topic-discovery-settings" open={connection.adminUrl ? true : undefined}><summary><Radio size={15} /> Topic discovery <span className="optional-label">Optional</span><ChevronDown size={15} /></summary><Field label="Admin URL"><input type="url" value={connection.adminUrl || ''} onChange={e => updateConnection('adminUrl', e.target.value)} placeholder="http://localhost:8085" autoComplete="off" spellCheck={false} aria-describedby="admin-url-hint" /></Field><small className="muted" id="admin-url-hint">Use the admin base URL or the full /amps/instance/sow.json endpoint. Enable the HTTP admin port on your AMPS server first. This only loads topic-name suggestions; manual entry always works.</small></details>
          {(error || bootError) && <div className="error" role="alert">{error || bootError}</div>}
          <button className="button primary entry-submit" type="submit">Open workspace <ArrowRight size={17} /></button>
          <p className="form-footnote"><ShieldCheck size={14} /> {connection.adminUrl?.trim() ? 'Loads topic names only. Spark starts when you run a command.' : 'Selecting a server does not start a connection.'}</p>
        </form>
      </section>
    </main>
    <footer className="entry-footer"><span>A SMALL TOOL FOR A CLEARER PICTURE.</span><span><span className={`dot ${bootstrap?.spark.ready ? '' : 'neutral'}`} /> {bootstrap ? bootstrap.spark.ready ? 'Spark CLI available' : 'Spark setup needed' : bootError ? 'Backend unavailable' : 'Checking local backend'}</span></footer>
  </div>;

  return <div className="app-shell">
    <aside className="sidebar"><Logo /><div className="workspace-label">WORKSPACE</div><button className="server-card" onClick={() => { if (active.length) { setError('Stop active sessions before changing the server.'); return; } setEntered(false); }} title="Change server"><span className="server-icon"><Server size={19} /></span><span><strong>{connection.name}</strong><small>{connection.server}</small></span><ChevronDown size={14} /></button>
      <div className="workspace-label command-heading">COMMANDS</div><nav aria-label="Spark commands">{(['sow', 'subscribe', 'publish', 'sow_and_subscribe'] as Command[]).map(key => { const Icon = icons[key]; return <button key={key} onClick={() => choose(key)} className={`nav-item ${command === key ? 'selected' : ''}`}><Icon size={18} /><span>{commands[key].label}</span>{command === key && <span className="nav-dot" />}</button>; })}
        <div className="workspace-label utilities-label">UTILITIES</div>{(['ping', 'latency', 'log_replay', 'sow_delete', 'help'] as Command[]).map(key => { const Icon = icons[key]; return <button key={key} onClick={() => choose(key)} className={`nav-item ${command === key ? 'selected' : ''}`}><Icon size={17} /><span>{commands[key].label}</span></button>; })}</nav>
      <div className="sidebar-bottom"><div className="local-indicator"><span className={`dot ${online ? '' : 'neutral'}`} /><span>{online ? 'Local workspace' : 'Reconnecting'}</span><span className="version">v0.1</span></div><p>Small commands.<br />A clearer picture.</p></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumbs">Workspace <ChevronRight size={14} /><span>{definition.label}</span></div><div className="topbar-right"><ThemePicker value={theme} onChange={changeTheme} /><span className="protocol-tag">{connection.secure ? 'TLS' : 'TCP'} <span>/</span> {connection.type || connection.proto}</span><span className="server-tag"><Server size={14} />{connection.server}</span></div></header>
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
        <div className="results-heading"><div><h2>Session output</h2><span>{sessions.length ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} this run` : 'Your results, in one place'}</span></div><span className="live-hint"><span className={`dot ${active.length ? '' : 'neutral'}`} /> {active.length ? 'Live updates' : 'Awaiting a command'}</span></div>
        {sessions.length > 0 && <div className="session-tabs" role="tablist" aria-label="Sessions">{sessions.map((s, index) => <button role="tab" aria-selected={selected === s.id} key={s.id} className={selected === s.id ? 'active' : ''} onClick={() => { setSelected(s.id); setFollow(true); }}><span className={`session-dot ${s.state}`} />{commands[s.command].label}<span className="session-number">{String(index + 1).padStart(2, '0')}</span></button>)}</div>}
        {session?.command === 'publish' && <section className="composer"><div className="section-heading"><span><Code2 size={16} /> Message composer <code>{session.topic}</code></span><select aria-label="Message format" value={format} onChange={e => setFormat(e.target.value)}><option value="json">JSON</option><option value="text">Plain text</option></select></div><textarea aria-label="Message payload" value={message} onChange={e => setMessage(e.target.value)} spellCheck={false} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (currentPublisher) send(); } }} /><div className="composer-footer"><span>{currentPublisher ? 'Send multiple messages through this publisher.' : 'This publisher is no longer running.'}<kbd>Ctrl ↵</kbd></span><button className="button primary small" disabled={!currentPublisher || sending || !message.trim()} onClick={send}><Send size={14} />{sending ? 'Sending…' : 'Send message'}</button></div></section>}
        <section className="output-card"><div className="output-toolbar"><div className="output-filters">{(['all', 'stdout', 'stderr'] as const).map(mode => <button className={outputMode === mode ? 'selected' : ''} key={mode} onClick={() => setOutputMode(mode)}>{mode === 'all' ? 'All activity' : mode === 'stdout' ? 'Output' : 'Errors'}</button>)}</div><div className="output-tools"><button className={`icon-button ${follow ? 'on' : ''}`} aria-label={follow ? 'Disable auto-scroll' : 'Enable auto-scroll'} title="Auto-scroll" onClick={() => setFollow(v => !v)}><ArrowDown size={15} /></button><button className="icon-button" title="Copy output" aria-label="Copy output" disabled={!output.length} onClick={() => copy(outputText)}><Clipboard size={15} /></button><button className="icon-button" title="Download output" aria-label="Download output" disabled={!output.length} onClick={download}><Download size={15} /></button><button className="icon-button" title="Clear display" aria-label="Clear display" disabled={!session} onClick={() => session && setCleared(v => ({ ...v, [session.id]: session.totalEvents }))}><Trash2 size={15} /></button>{session && isActive(session.state) && <button className="button stop-button small" disabled={session.state === 'stopping'} onClick={() => stop(session.id)}><Square size={11} fill="currentColor" /> Stop</button>}</div></div>
          <div className="output-body" ref={outputRef} tabIndex={0} aria-label="Spark output">{output.length ? output.map(event => <div className={`output-line ${event.kind}`} key={event.id}><span className="output-time">{clock(event.time)}</span><span className="output-kind">{event.kind === 'stdout' ? 'OUT' : event.kind === 'stderr' ? 'ERR' : event.kind === 'sent' ? 'IN' : 'SYS'}</span><pre>{event.text}</pre></div>) : <div className="empty-output"><span className="empty-terminal"><Terminal size={29} /></span><h3>{session ? 'A quiet moment.' : 'Ready for your first command.'}</h3><p>{session ? 'Output will appear here as Spark writes it. Try All activity to see session events.' : 'Configure a command above and run it.\nThe response from Spark will appear right here.'}</p><span className="empty-shortcut"><span className="dot neutral" /> {session ? activeLabel(session.state) : 'No session started'}</span></div>}</div>
          <div className="output-status"><span>{session ? <><span className={`session-dot ${session.state}`} />{activeLabel(session.state)}<span className="status-divider">/</span>{session.events.length} retained entries{session.totalEvents > 500 && <span> · older output discarded</span>}</> : <><Terminal size={13} /> Spark CLI output</>}</span><span>{session ? `Started ${clock(session.createdAt)}` : 'Nothing runs until you say so.'}</span></div>
        </section>
        {session && <div className="command-preview"><Terminal size={14} /><code>{session.preview}</code><button className="icon-button" aria-label="Copy command" title="Copy command (credentials redacted)" onClick={() => copy(session.preview)}><Clipboard size={14} /></button></div>}
        <footer className="workspace-footer"><span><ShieldCheck size={13} /> Runs locally. Powered by Spark.</span><span>AMPS / DEVELOPER TOOLS</span></footer>
      </main>
    </div>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    {showDelete && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><span className="danger-icon"><Trash2 size={24} /></span><h2 id="delete-title">Delete matching records?</h2><p>This runs <code>sow_delete</code> on <strong>{connection.server}</strong>. This action changes server data.</p><dl><dt>Topic</dt><dd>{topic}</dd><dt>Filter</dt><dd>{filter}</dd></dl><div className="modal-actions"><button className="button subtle" autoFocus onClick={() => setShowDelete(false)}>Cancel</button><button className="button danger" onClick={() => run(true)}>Delete records</button></div></section></div>}
  </div>;
}
