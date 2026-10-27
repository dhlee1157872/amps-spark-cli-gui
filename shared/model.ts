export const commands = {
  sow: { label: 'SOW', eyebrow: 'STATE OF THE WORLD', title: 'SOW Query', description: 'Inspect a snapshot of the messages in a topic.', action: 'Run query', topic: true },
  subscribe: { label: 'Subscribe', eyebrow: 'LIVE MESSAGES', title: 'Subscribe', description: 'Watch incoming messages on a topic in real time.', action: 'Start subscription', topic: true },
  publish: { label: 'Publish', eyebrow: 'MESSAGE COMPOSER', title: 'Publish', description: 'Open a publisher, then send messages through the same session.', action: 'Start publisher', topic: true },
  sow_and_subscribe: { label: 'SOW & Subscribe', eyebrow: 'SNAPSHOT + LIVE', title: 'SOW & Subscribe', description: 'Read the current state and keep watching for changes.', action: 'Start session', topic: true },
  ping: { label: 'Ping', eyebrow: 'CONNECTION CHECK', title: 'Ping', description: 'Run Spark ping against your selected server.', action: 'Run ping', topic: false },
  latency: { label: 'Latency', eyebrow: 'DIAGNOSTICS', title: 'Latency', description: 'Run the Spark latency command. Check CLI help for required options.', action: 'Run latency', topic: true },
  sow_delete: { label: 'SOW Delete', eyebrow: 'TOPIC MAINTENANCE', title: 'SOW Delete', description: 'Delete matching records using an explicit topic and filter.', action: 'Delete matching records', topic: true },
  log_replay: { label: 'Log Replay', eyebrow: 'DIAGNOSTICS', title: 'Log Replay', description: 'Run Spark log_replay with the options supported by your installation.', action: 'Start replay', topic: false },
  help: { label: 'CLI help', eyebrow: 'YOUR INSTALLED CLI', title: 'Help', description: 'Read the help output from your actual Spark installation.', action: 'Show help', topic: false },
} as const;
export type Command = keyof typeof commands;
export interface Connection { name: string; server: string; username: string; password: string; secure: boolean; proto: string; type: string; adminUrl?: string }
export interface Option { flag: string; value: string }
export interface RunRequest { workspaceId?: string; command: Command; connection: Connection; topic: string; filter: string; topn: string; options: Option[]; helpCommand: string; confirmDelete?: boolean }
export type State = 'starting' | 'running' | 'stopping' | 'completed' | 'stopped' | 'failed';
export interface OutputEvent { id: number; time: string; kind: 'stdout' | 'stderr' | 'system' | 'sent'; text: string }
export interface SessionOption { flag: string; value: string | null }
export interface Session { id: string; workspaceId?: string; workspaceName?: string; command: Command; topic: string; server: string; preview: string; options: SessionOption[]; state: State; createdAt: string; endedAt?: string; exitCode?: number | null; events: OutputEvent[]; totalEvents: number }
export type SessionUpdate =
  | { type: 'snapshot'; sessions: Session[] }
  | { type: 'session'; session: Session }
  | { type: 'output'; sessionId: string; event: OutputEvent }
  | { type: 'status'; session: Omit<Session, 'events'> }
  | { type: 'removed'; id: string };
export interface Bootstrap { token: string; spark: { ready: boolean; path: string; error?: string }; sessions: Session[] }
export const isActive = (state: State) => ['starting', 'running', 'stopping'].includes(state);
