import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';

import { config } from './config.js';
import { auth } from './middleware/auth.js';
import { router as apiRouter } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));
app.use(cookieParser());

app.post('/api/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (username === config.loginUsername && password === config.loginPassword) {
    res.cookie(config.sessionCookieName, config.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: config.sessionCookieMaxAgeMs,
      path: '/',
    });
    return res.json({ status: 'ok' });
  }
  return res.status(401).json({ error: 'invalid credentials' });
});

app.use('/api', apiRouter);

app.get('/api/health', auth, (_req, res) => {
  res.json({ status: 'ok' });
});

// serve client
app.use(express.static(config.staticDir));
app.get('*', (_req, res) => {
  const indexPath = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('client not built');
  }
});

app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
  console.log(`[server] repo root: ${config.repoRoot}`);
});
