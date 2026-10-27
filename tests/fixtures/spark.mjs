// A subprocess fixture for testing the adapter. Never used by the application.
import readline from 'node:readline';
import { spawn } from 'node:child_process';
const command = process.argv[2];
if (command === 'publish') {
  console.log('publisher ready');
  readline.createInterface({ input: process.stdin }).on('line', line => console.log(`received:${line}`));
} else if (command === 'subscribe') {
  const timer = setInterval(() => console.log('{"id":1}'), 30);
  process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
} else if (command === 'latency') {
  // A stubborn child verifies cancellation of the whole process group.
  spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>console.log("child alive"),30)'], { stdio: ['ignore', 'inherit', 'inherit'] });
  process.on('SIGTERM', () => {});
} else if (command === 'ping') {
  console.error('connection refused');
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({ args: process.argv.slice(2) }));
}
