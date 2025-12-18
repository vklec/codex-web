import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const required = (name: string) => {
  const value = (process.env[name] ?? '').trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

const loginUsername = required('LOGIN_USERNAME');
const loginPassword = required('LOGIN_PASSWORD');
const sessionSecret = required('SESSION_SECRET');
const repoRoot = path.resolve(required('REPO_ROOT'));

export const config = {
  port: Number(process.env.PORT ?? 8788),
  staticDir: path.resolve(process.cwd(), 'dist', 'client'),

  repoRoot,
  dataDir: path.resolve(process.cwd(), 'data'),

  loginUsername,
  loginPassword,
  sessionSecret,
  sessionCookieName: 'codex_web_session',
  sessionToken: crypto
    .createHash('sha256')
    .update(`${loginUsername}:${loginPassword}:${sessionSecret}`)
    .digest('hex'),
  sessionCookieMaxAgeMs: 1000 * 60 * 60 * 24 * 30,
};
