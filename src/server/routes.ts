import { Router } from 'express';
import { auth } from './middleware/auth.js';
import { config } from './config.js';
import { listRepos, setFavorites, getFavorites, validateRepoPath } from './repos.js';
import { terminalManager, type TerminalEvent } from './terminal.js';

const router = Router();

const writeSse = (res: import('express').Response, payload: unknown) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

router.get('/repos', auth, async (_req, res) => {
  try {
    const repos = await listRepos();
    const favorites = await getFavorites();
    res.json({ root: config.repoRoot, repos, favorites });
  } catch (error) {
    console.error('[repos] list failed', error);
    res.status(500).json({ error: 'failed to list repos' });
  }
});

router.post('/repos/favorites', auth, async (req, res) => {
  const { favorites } = req.body as { favorites?: unknown };
  if (!Array.isArray(favorites)) return res.status(400).json({ error: 'favorites must be array' });
  try {
    const saved = await setFavorites(favorites as string[]);
    res.json({ favorites: saved });
  } catch (error) {
    console.error('[repos] set favorites failed', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'invalid paths' });
  }
});

router.post('/terminal/start', auth, (req, res) => {
  const { path: cwd } = req.body as { path?: string };
  if (!cwd || typeof cwd !== 'string') return res.status(400).json({ error: 'path required' });
  try {
    validateRepoPath(cwd);
    const session = terminalManager.startSession(cwd);
    res.json({ sessionId: session.id, cwd: session.cwd, createdAt: session.createdAt });
  } catch (error) {
    console.error('[terminal] start failed', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'failed to start session' });
  }
});

router.get('/terminal/:sessionId', auth, (req, res) => {
  const { sessionId } = req.params;
  const session = terminalManager.getSessionInfo(sessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  res.json(session);
});

router.get('/terminal/:sessionId/stream', auth, (req, res) => {
  const { sessionId } = req.params;
  const session = terminalManager.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  writeSse(res, { type: 'init', data: session.buffer.join('') });
  let heartbeat: NodeJS.Timeout | null = null;

  const onEvent = (evt: TerminalEvent) => {
    if (evt.sessionId !== sessionId) return;
    if (evt.type === 'data') {
      writeSse(res, { type: 'data', data: evt.data });
      return;
    }
    if (evt.type === 'exit') {
      writeSse(res, { type: 'exit', code: evt.code, signal: evt.signal });
    }
  };

  terminalManager.on('event', onEvent);

  heartbeat = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 25000);
  heartbeat.unref?.();

  req.on('close', () => {
    terminalManager.off('event', onEvent);
    if (heartbeat) clearInterval(heartbeat);
  });
});

router.post('/terminal/:sessionId/input', auth, (req, res) => {
  const { sessionId } = req.params;
  const { data, enter } = req.body as { data?: string; enter?: boolean };
  if (typeof data !== 'string' && !enter) return res.status(400).json({ error: 'data required' });
  try {
    const payload = `${data ?? ''}`;
    terminalManager.write(sessionId, payload, !!enter);
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('[terminal] write failed', error);
    res.status(404).json({ error: 'session not found' });
  }
});

router.post('/terminal/:sessionId/resize', auth, (req, res) => {
  const { sessionId } = req.params;
  const { cols, rows } = req.body as { cols?: number; rows?: number };
  try {
    terminalManager.resize(sessionId, Number(cols) || 120, Number(rows) || 32);
    res.json({ status: 'ok' });
  } catch {
    res.status(404).json({ error: 'session not found' });
  }
});

router.post('/terminal/:sessionId/stop', auth, (req, res) => {
  const { sessionId } = req.params;
  terminalManager.stop(sessionId);
  res.json({ status: 'stopped' });
});

export { router };
