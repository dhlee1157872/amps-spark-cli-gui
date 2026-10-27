import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const temporary = path.resolve('tmp');
mkdirSync(temporary, { recursive: true });
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env, TMPDIR: temporary },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
