import express from 'express';
import { randomBytes } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Sessions } from './sessions.js';
import { root, sparkLocation } from './commands.js';
import { fetchTopicNames } from './topics.js';

const app = express();
const server = createHttpServer(app);
const token = randomBytes(32).toString('hex');
const sessions = new Sessions();
const port = Number(process.env.PORT || 4310);
await mkdir(path.join(root, 'tmp'), { recursive: true });
app.disable('x-powered-by');
app.use((req, res, next) => {
  const allowed = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!allowed.includes(req.headers.host || '')) return res.status(403).json({ error: 'Local access only.' });
  if (req.headers.origin && !allowed.map(host => `http://${host}`).includes(req.headers.origin)) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use('/api', express.json({ limit: '300kb' }));
app.get('/api/bootstrap', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token, spark: await sparkLocation(), sessions: sessions.list() });
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const provided = req.headers['x-spark-token'] || (req.method === 'GET' && req.query.token);
  if (provided !== token) return res.status(403).json({ error: 'Refresh this page to reconnect to the local backend.' });
  next();
});
app.post('/api/topics', async (req, res) => {
  try { res.json({ topics: await fetchTopicNames(req.body?.adminUrl) }); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
app.post('/api/sessions', async (req, res) => {
  try { res.status(201).json(await sessions.create(req.body)); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
app.post('/api/sessions/clear-finished', async (_req, res) => {
  try { res.json({ removed: await sessions.clearFinished() }); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
app.delete('/api/sessions/:id', async (req, res) => {
  try { await sessions.remove(req.params.id); res.json({ removed: [req.params.id] }); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
app.post('/api/sessions/:id/input', async (req, res) => {
  try { await sessions.send(req.params.id, req.body.message, req.body.format); res.json({ ok: true }); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
app.post('/api/sessions/:id/stop', (req, res) => { sessions.stop(req.params.id); res.json({ ok: true }); });
app.get('/api/sessions/:id/events', (req, res) => {
  const runtime = sessions.get(req.params.id);
  if (!runtime) return res.status(404).json({ error: 'Session not found.' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const detach = sessions.attach(req.params.id);
  const write = (event: string, data: unknown) => {
    if (res.destroyed) return;
    // Disconnect slow readers instead of allowing unbounded socket buffers.
    if (res.writableLength > 1_000_000) { res.destroy(); return; }
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  write('snapshot', runtime.session);
  const event = (data: unknown) => write('output', data);
  const status = (data: unknown) => write('status', data);
  const removed = (data: unknown) => { write('removed', data); res.end(); };
  runtime.bus.on('event', event);
  runtime.bus.on('status', status);
  runtime.bus.on('removed', removed);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 10_000);
  res.on('close', () => { clearInterval(heartbeat); runtime.bus.off('event', event); runtime.bus.off('status', status); runtime.bus.off('removed', removed); detach(); });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
if (process.argv[1].endsWith('.ts')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try { res.type('html').send(await vite.transformIndexHtml(req.originalUrl, await readFile(path.join(root, 'index.html'), 'utf8'))); }
    catch (error) { next(error); }
  });
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ error: error.message }));
server.listen(port, '127.0.0.1', () => console.log(`\n  Spark Workbench  http://localhost:${port}\n  Commands use Spark CLI; optional topic discovery uses the AMPS admin endpoint.\n`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { sessions.shutdown(); server.close(); process.exit(0); });
server.on('error', error => { console.error(error.message); sessions.shutdown(); process.exit(1); });
