import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { isActive, type OutputEvent, type RunRequest, type Session } from '../shared/model.js';
import { buildCommand, root, sparkLocation } from './commands.js';

interface Runtime { session: Session; process: ChildProcessWithoutNullStreams; bus: EventEmitter; secrets: string[]; viewers: number; grace?: NodeJS.Timeout; killTimer?: NodeJS.Timeout }
type Launcher = () => Promise<{ file: string; prefix?: string[] }>;
export class Sessions {
  private items = new Map<string, Runtime>();
  constructor(private launch: Launcher = async () => {
    const spark = await sparkLocation();
    if (!spark.ready) throw new Error(spark.error);
    return { file: spark.path };
  }, private graceMs = 30_000) {}
  list() { return [...this.items.values()].map(r => r.session); }
  get(id: string) { return this.items.get(id); }
  private emit(runtime: Runtime, kind: OutputEvent['kind'], text: string) {
    for (const secret of runtime.secrets) text = text.replaceAll(secret, '***');
    // Bound both individual entries and retained history; the UI labels these as output entries.
    for (let offset = 0; offset < text.length; offset += 8192) {
      const event = { id: ++runtime.session.totalEvents, time: new Date().toISOString(), kind, text: text.slice(offset, offset + 8192) };
      runtime.session.events.push(event);
      if (runtime.session.events.length > 500) runtime.session.events.shift();
      runtime.bus.emit('event', event);
    }
  }
  private status(runtime: Runtime) { runtime.bus.emit('status', this.summary(runtime)); }
  summary(runtime: Runtime) { const { events, ...rest } = runtime.session; return rest; }
  private armGrace(runtime: Runtime) {
    clearTimeout(runtime.grace);
    if (!runtime.viewers && isActive(runtime.session.state)) runtime.grace = setTimeout(() => this.stop(runtime.session.id), this.graceMs).unref();
  }
  attach(id: string) {
    const runtime = this.items.get(id);
    if (!runtime) throw new Error('Session not found.');
    runtime.viewers++;
    clearTimeout(runtime.grace);
    return () => { runtime.viewers = Math.max(0, runtime.viewers - 1); this.armGrace(runtime); };
  }
  async create(request: RunRequest) {
    const built = await buildCommand(request);
    const { file, prefix = [] } = await this.launch();
    if (this.list().filter(s => isActive(s.state)).length >= 6) throw new Error('Stop a session before opening another (maximum 6 active sessions).');
    for (const [id, runtime] of this.items) {
      if (this.items.size < 24) break;
      if (!isActive(runtime.session.state) && runtime.viewers === 0) this.items.delete(id);
    }
    if (this.items.size >= 32) throw new Error('Session history is full. Restart the local backend to clear it.');
    const child = spawn(file, [...prefix, ...built.args], { cwd: root, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: `${root}/tmp` } });
    const session: Session = { id: randomUUID(), command: request.command, topic: request.topic || '', server: request.connection?.server || '', preview: built.preview, options: built.options, state: 'starting', createdAt: new Date().toISOString(), events: [], totalEvents: 0 };
    const runtime: Runtime = { session, process: child, bus: new EventEmitter(), secrets: built.secrets, viewers: 0 };
    this.items.set(session.id, runtime);
    this.emit(runtime, 'system', 'Starting Spark. Process state does not indicate server connectivity.');
    child.once('spawn', () => { if (session.state === 'starting') session.state = 'running'; this.status(runtime); });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data: string) => this.emit(runtime, 'stdout', data));
    child.stderr.on('data', (data: string) => this.emit(runtime, 'stderr', data));
    child.stdin.on('error', (error: Error) => this.emit(runtime, 'stderr', `Spark input closed: ${error.message}`));
    child.once('error', error => { session.state = 'failed'; this.emit(runtime, 'stderr', `Unable to start Spark: ${error.message}`); this.status(runtime); });
    child.once('close', (code, signal) => {
      clearTimeout(runtime.grace);
      // Keep the forced group cleanup scheduled after Stop, even if the launcher exits first.
      session.state = session.state === 'stopping' ? 'stopped' : session.state === 'failed' || code !== 0 ? 'failed' : 'completed';
      session.exitCode = code;
      session.endedAt = new Date().toISOString();
      this.emit(runtime, 'system', `Spark ${session.state}${signal ? ` (${signal})` : ` (exit ${code})`}.`);
      this.status(runtime);
    });
    this.armGrace(runtime);
    return session;
  }
  async send(id: string, message: unknown, format: unknown) {
    const runtime = this.items.get(id);
    if (!runtime || runtime.session.command !== 'publish' || runtime.session.state !== 'running' || runtime.process.stdin.destroyed) throw new Error('Start a publisher before sending a message.');
    if (typeof message !== 'string' || !message.trim() || message.length > 256_000) throw new Error('Enter a message smaller than 256 KB.');
    if (format === 'json') {
      try { message = JSON.stringify(JSON.parse(message)); } catch { throw new Error('The message is not valid JSON.'); }
    } else if (format !== 'text' || /[\r\n\0]/.test(message)) throw new Error('Text messages must fit on one line; use JSON mode for formatted JSON.');
    await new Promise<void>((resolve, reject) => runtime.process.stdin.write(`${message}\n`, error => error ? reject(error) : resolve()));
    this.emit(runtime, 'sent', `Written to Spark stdin (not a server acknowledgment):\n${message}`);
  }
  private signal(runtime: Runtime, signal: NodeJS.Signals) {
    if (!runtime.process.pid) return;
    try {
      if (process.platform !== 'win32') process.kill(-runtime.process.pid, signal);
      else runtime.process.kill(signal);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') this.emit(runtime, 'stderr', 'Could not terminate the Spark process.'); }
  }
  stop(id: string) {
    const runtime = this.items.get(id);
    if (!runtime || !isActive(runtime.session.state) || runtime.session.state === 'stopping') return;
    runtime.session.state = 'stopping';
    clearTimeout(runtime.grace);
    this.status(runtime);
    this.signal(runtime, 'SIGTERM');
    runtime.killTimer = setTimeout(() => { this.signal(runtime, 'SIGKILL'); runtime.killTimer = undefined; }, 1500).unref();
  }
  shutdown() {
    for (const runtime of this.items.values()) {
      clearTimeout(runtime.grace);
      clearTimeout(runtime.killTimer);
      if (isActive(runtime.session.state) || runtime.killTimer) this.signal(runtime, 'SIGKILL');
      runtime.bus.removeAllListeners();
    }
  }
}
