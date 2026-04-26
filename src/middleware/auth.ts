/**
 * @fileoverview API key authentication middleware
 *
 * Validates the X-Tatua-Key header on all /api/* routes.
 * Attaches the resolved business to req.business.
 */

import { Request, Response, NextFunction } from 'express';
import { getBusinessByApiKey, Business } from '../db/database';

// Extend Express Request to carry the resolved business
declare global {
  namespace Express {
    interface Request {
      business?: Business;
    }
  }
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey =
    (req.headers['x-tatua-key'] as string) ||
    (req.headers['authorization'] || '').replace('Bearer ', '');

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key. Provide X-Tatua-Key header.' });
    return;
  }

  const business = getBusinessByApiKey(apiKey);
  if (!business) {
    res.status(401).json({ error: 'Invalid or inactive API key.' });
    return;
  }

  req.business = business;
  next();
}

export function requireAdminSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-admin-secret'] as string;
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
