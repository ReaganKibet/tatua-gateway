/**
 * @fileoverview API routes for SDK consumers
 *
 * These are the endpoints the Tatua SDK calls on behalf of businesses.
 * All routes require X-Tatua-Key header.
 *
 * GET  /api/transactions          - list transactions for this business
 * GET  /api/transactions/:transId - get single transaction by M-Pesa TransID
 * GET  /api/me                    - get business profile
 */

import { Router, Request, Response } from 'express';
import { requireApiKey } from '../middleware/auth';
import {
  listTransactionsByBusiness,
  getTransactionByTransId,
  countTransactionsByBusiness,
} from '../db/database';

const router = Router();

// All routes require API key
router.use(requireApiKey);

// ─── GET /api/me ──────────────────────────────────────────────────────────────

router.get('/me', (req: Request, res: Response) => {
  const b = req.business!;
  res.json({
    id: b.id,
    name: b.name,
    shortcode: b.shortcode,
    shortcodeType: b.shortcode_type,
    createdAt: b.created_at,
  });
});

// ─── GET /api/transactions ────────────────────────────────────────────────────

router.get('/transactions', (req: Request, res: Response) => {
  const business = req.business!;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const transactions = listTransactionsByBusiness(business.id, { limit, offset, from, to });
  const total = countTransactionsByBusiness(business.id);

  res.json({
    data: transactions.map(formatTransaction),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + transactions.length < total,
    },
  });
});

// ─── GET /api/transactions/:transId ──────────────────────────────────────────

router.get('/transactions/:transId', (req: Request, res: Response) => {
  const business = req.business!;
  const { transId } = req.params;

  const transaction = getTransactionByTransId(transId);

  if (!transaction) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  // Ensure this transaction belongs to the authenticated business
  if (transaction.business_id !== business.id) {
    res.status(403).json({ error: 'Transaction does not belong to your account' });
    return;
  }

  res.json({ data: formatTransaction(transaction) });
});

// ─── Formatter ────────────────────────────────────────────────────────────────

function formatTransaction(t: any) {
  return {
    id: t.id,
    transId: t.trans_id,
    shortcode: t.shortcode,
    phone: t.phone,
    amount: t.amount,
    billRef: t.bill_ref,
    customer: {
      firstName: t.first_name,
      middleName: t.middle_name,
      lastName: t.last_name,
    },
    transactionType: t.transaction_type,
    orgBalance: t.org_balance,
    webhookDelivered: t.webhook_delivered === 1,
    timestamp: t.created_at,
  };
}

export default router;
