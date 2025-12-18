import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function auth(req: Request, res: Response, next: NextFunction) {
  const hasSessionCookie = req.cookies?.[config.sessionCookieName] === config.sessionToken;
  if (hasSessionCookie) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

