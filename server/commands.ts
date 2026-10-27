import { access, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { commands, type RunRequest } from '../shared/model.js';

export const root = process.cwd();
export async function workspacePath(input: string) {
  const candidate = path.resolve(root, input);
  const lexical = path.relative(root, candidate);
  if (lexical.startsWith('..' + path.sep) || lexical === '..' || path.isAbsolute(lexical)) throw new Error('Use a file inside this workspace. External paths and symlinks are not allowed.');
  const absolute = await realpath(candidate);
  const relative = path.relative(await realpath(root), absolute);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Use a file inside this workspace. External paths and symlinks are not allowed.');
  return absolute;
}
export async function sparkExecutable(configured: string, allowedExternalExecutables: string[] = []) {
  const candidate = path.resolve(root, configured);
  if (allowedExternalExecutables.includes(candidate)) {
    const resolved = await realpath(candidate);
    if (resolved !== candidate) throw new Error('The approved Spark executable must not redirect through a symlink.');
    return resolved;
  }
  return workspacePath(configured);
}
export async function sparkLocation() {
  let configured = process.env.SPARK_BIN || './tools/spark/bin/spark';
  try {
    let settings: { executable?: string; allowedExternalExecutables?: string[] } = {};
    try {
      settings = JSON.parse(await readFile(path.join(root, 'spark.local.json'), 'utf8'));
      if (!settings || typeof settings !== 'object' || (settings.executable !== undefined && typeof settings.executable !== 'string') || (settings.allowedExternalExecutables !== undefined && (!Array.isArray(settings.allowedExternalExecutables) || !settings.allowedExternalExecutables.every(value => typeof value === 'string' && path.isAbsolute(value))))) throw new Error('Invalid spark.local.json settings.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    configured = process.env.SPARK_BIN || settings.executable || configured;
    const file = await sparkExecutable(configured, settings.allowedExternalExecutables);
    await access(file, constants.X_OK);
    return { ready: true, path: file };
  } catch (error) {
    return { ready: false, path: configured, error: `Spark is not available at ${configured}. Check spark.local.json or SPARK_BIN. External executables need an exact allowedExternalExecutables entry. ${(error as Error).message}` };
  }
}
const checkString = (value: unknown, label: string, max = 4096): string => {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error(`Invalid ${label}.`);
  return value;
};
const quote = (value: string) => /^[a-zA-Z0-9_./:@=-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'";
export async function buildCommand(input: RunRequest) {
  if (!input || !Object.hasOwn(commands, input.command)) throw new Error('Choose a supported Spark command.');
  const args: string[] = [input.command];
  if (input.command === 'help') {
    if (input.helpCommand) {
      if (!Object.hasOwn(commands, input.helpCommand)) throw new Error('Unknown help command.');
      args.push(input.helpCommand);
    }
    return { args, preview: ['spark', ...args].map(quote).join(' '), secrets: [] as string[] };
  }
  const c = input.connection;
  if (!c || typeof c.secure !== 'boolean') throw new Error('Select a server first.');
  const server = checkString(c.server, 'server', 512).trim();
  if (!/^(?:[a-zA-Z0-9_.-]+|\[[0-9a-fA-F:]+\]):\d{1,5}$/.test(server) || Number(server.slice(server.lastIndexOf(':') + 1)) < 1 || Number(server.slice(server.lastIndexOf(':') + 1)) > 65535) throw new Error('Enter a server as hostname:port (for example localhost:9007).');
  const user = checkString(c.username, 'username', 256);
  const password = checkString(c.password, 'password', 1024);
  if ((user && !password) || (!user && password)) throw new Error('Provide both username and password, or leave both blank. Interactive password prompts are not supported.');
  if (/[\r\n:@]/.test(user) || /[\r\n@]/.test(password)) throw new Error('Credentials contain characters unsupported by this prototype.');
  args.push('-server', user ? `${user}:${password}@${server}` : server);
  if (!['amps', 'fix', 'nvfix', 'xml'].includes(c.proto)) throw new Error('Unsupported protocol.');
  args.push('-proto', c.proto);
  if (c.type) args.push('-type', checkString(c.type, 'message type', 64));
  if (c.secure) args.push('-secure', 'true');
  if (commands[input.command].topic) {
    const topic = checkString(input.topic, 'topic', 512).trim();
    if (!topic || topic.startsWith('-')) throw new Error('Enter a topic name.');
    args.push('-topic', topic);
  }
  if (input.filter) args.push('-filter', checkString(input.filter, 'filter'));
  if (['sow', 'sow_and_subscribe'].includes(input.command) && input.topn) {
    if (!/^\d+$/.test(input.topn) || Number(input.topn) > 100000) throw new Error('Result limit must be between 0 and 100000.');
    args.push('-topn', input.topn);
  }
  if (input.command === 'sow_delete' && (!input.filter?.trim() || input.confirmDelete !== true)) throw new Error('Deletion requires a filter and explicit confirmation.');
  if (!Array.isArray(input.options) || input.options.length > 20) throw new Error('Use at most 20 additional options.');
  const used = new Set(['server', 'topic', 'filter', 'topn', 'proto', 'prot', 'type', 'secure', 'delimiter']);
  for (const option of input.options) {
    const flag = checkString(option.flag, 'option name', 64).replace(/^-/, '');
    if (!/^[a-z][a-z0-9_]*$/.test(flag) || used.has(flag)) throw new Error(`Invalid or duplicate option: ${flag}`);
    let value = checkString(option.value, 'option value');
    if (flag === 'file') {
      if (input.command === 'sow') throw new Error('SOW file export is not supported in v1. Copy or download the displayed output instead.');
      value = await workspacePath(value);
    }
    used.add(flag);
    args.push(`-${flag}`);
    if (value) args.push(value);
  }
  const preview = args.map((arg, i) => i > 0 && args[i - 1] === '-server' && user ? `${user}:***@${server}` : arg);
  return { args, preview: ['spark', ...preview].map(quote).join(' '), secrets: password ? [password] : [] };
}
