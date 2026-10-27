export const commands = {
  sow: { label: 'SOW', eyebrow: 'STATE OF THE WORLD', title: 'Find what you need.', description: 'Inspect a snapshot of the messages in a topic.', action: 'Run query', topic: true },
  subscribe: { label: 'Subscribe', eyebrow: 'LIVE MESSAGES', title: 'See it as it happens.', description: 'Watch incoming messages on a topic in real time.', action: 'Start subscription', topic: true },
  publish: { label: 'Publish', eyebrow: 'MESSAGE COMPOSER', title: 'Put a message in motion.', description: 'Open a publisher, then send messages through the same session.', action: 'Start publisher', topic: true },
  sow_and_subscribe: { label: 'Query + subscribe', eyebrow: 'SNAPSHOT + LIVE', title: 'The full picture. Then the updates.', description: 'Read the current state and keep watching for changes.', action: 'Start session', topic: true },
  ping: { label: 'Ping', eyebrow: 'CONNECTION CHECK', title: 'Start with a quick check.', description: 'Run Spark ping against your selected server.', action: 'Run ping', topic: false },
  latency: { label: 'Latency', eyebrow: 'DIAGNOSTICS', title: 'Get a feel for response time.', description: 'Run the Spark latency command. Check CLI help for required options.', action: 'Run latency', topic: true },
  sow_delete: { label: 'SOW Delete', eyebrow: 'TOPIC MAINTENANCE', title: 'Make a precise change.', description: 'Delete matching records using an explicit topic and filter.', action: 'Delete matching records', topic: true },
  log_replay: { label: 'Log replay', eyebrow: 'DIAGNOSTICS', title: 'Replay with intention.', description: 'Run Spark log_replay with the options supported by your installation.', action: 'Start replay', topic: false },
  help: { label: 'CLI help', eyebrow: 'YOUR INSTALLED CLI', title: 'Straight from Spark.', description: 'Read the help output from your actual Spark installation.', action: 'Show help', topic: false },
} as const;
export type Command = keyof typeof commands;
export interface Connection { name: string; server: string; username: string; password: string; secure: boolean; proto: string; type: string; adminUrl?: string }
export interface Option { flag: string; value: string }
export interface RunRequest { command: Command; connection: Connection; topic: string; filter: string; topn: string; options: Option[]; helpCommand: string; confirmDelete?: boolean }
export type State = 'starting' | 'running' | 'stopping' | 'completed' | 'stopped' | 'failed';
export interface OutputEvent { id: number; time: string; kind: 'stdout' | 'stderr' | 'system' | 'sent'; text: string }
export interface SessionOption { flag: string; value: string | null }
export interface Session { id: string; command: Command; topic: string; server: string; preview: string; options: SessionOption[]; state: State; createdAt: string; endedAt?: string; exitCode?: number | null; events: OutputEvent[]; totalEvents: number }
export interface Bootstrap { token: string; spark: { ready: boolean; path: string; error?: string }; sessions: Session[] }
export const isActive = (state: State) => ['starting', 'running', 'stopping'].includes(state);
