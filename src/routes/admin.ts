/**
 * @fileoverview Admin routes
 *
 * Used internally to onboard businesses and manage the gateway.
 * Protected by X-Admin-Secret header.
 *
 * POST /admin/businesses         - register a new business
 * GET  /admin/businesses         - list all businesses
 * POST /admin/register-c2b       - register C2B URLs for a shortcode
 */

import { Router, Request, Response } from 'express';
import { requireAdminSecret } from '../middleware/auth';
import { createBusiness, listBusinesses } from '../db/database';
import { registerC2BUrls } from '../services/c2b-registration';
import { pullC2BTransactions } from '../services/pull-transactions';
import { queryTransactionStatus } from '../services/transaction-status';

const router = Router();

router.use(requireAdminSecret);

// ─── POST /admin/businesses ───────────────────────────────────────────────────

router.post('/businesses', async (req: Request, res: Response) => {
  const { name, shortcode, shortcodeType, webhookUrl } = req.body;

  if (!name || !shortcode || !shortcodeType) {
    res.status(400).json({ error: 'name, shortcode, and shortcodeType are required' });
    return;
  }

  if (!['till', 'paybill', 'mobile'].includes(shortcodeType)) {
    res.status(400).json({ error: 'shortcodeType must be till, paybill, or mobile' });
    return;
  }

  try {
    const business = createBusiness(name, String(shortcode), shortcodeType, webhookUrl);

    res.status(201).json({
      message: 'Business registered successfully',
      business: {
        id: business.id,
        name: business.name,
        shortcode: business.shortcode,
        shortcodeType: business.shortcode_type,
        apiKey: business.api_key,  // shown once at creation
        webhookUrl: business.webhook_url,
        createdAt: business.created_at,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ error: `Shortcode ${shortcode} is already registered` });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /admin/businesses ────────────────────────────────────────────────────

router.get('/businesses', (_req: Request, res: Response) => {
  const businesses = listBusinesses();
  res.json({
    data: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      shortcode: b.shortcode,
      shortcodeType: b.shortcode_type,
      webhookUrl: b.webhook_url,
      active: b.active,
      createdAt: b.created_at,
      // api_key intentionally excluded from list endpoint
    })),
  });
});

// ─── POST /admin/register-c2b ─────────────────────────────────────────────────

router.post('/register-c2b', async (req: Request, res: Response) => {
  const { shortcode } = req.body;

  if (!shortcode) {
    res.status(400).json({ error: 'shortcode is required' });
    return;
  }

  const result = await registerC2BUrls(String(shortcode));
  res.status(result.success ? 200 : 500).json(result);
});

// ─── POST /admin/reconcile ────────────────────────────────────────────────────
// Pull C2B transactions from Daraja for a shortcode + date range.
// Syncs any missed payments into the local DB (idempotent — skips duplicates).

router.post('/reconcile', async (req: Request, res: Response) => {
  const { shortcode, startDate, endDate, offset } = req.body;

  if (!shortcode || !startDate || !endDate) {
    res.status(400).json({ error: 'shortcode, startDate, endDate required (format: YYYYMMDD)' });
    return;
  }

  try {
    const result = await pullC2BTransactions(
      String(shortcode),
      String(startDate),
      String(endDate),
      typeof offset === 'number' ? offset : 0
    );
    res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /admin/check-transaction ───────────────────────────────────────────
// Submit an async transaction status query to Daraja.
// Result will arrive at POST /daraja/result (async callback).

router.post('/check-transaction', async (req: Request, res: Response) => {
  const { transactionId, shortcode, identifierType } = req.body;

  if (!transactionId || !shortcode) {
    res.status(400).json({ error: 'transactionId and shortcode required' });
    return;
  }

  try {
    const result = await queryTransactionStatus({
      transactionId: String(transactionId),
      shortcode: String(shortcode),
      identifierType: identifierType ?? '4',
    });
    res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
