/**
 * @fileoverview Daraja callback routes
 *
 * These are the URLs Safaricom calls when a customer makes a payment.
 * POST /daraja/confirmation  ← payment confirmed (record it)
 * POST /daraja/validation    ← payment about to happen (accept/reject)
 *
 * Flow:
 *  1. Customer pays Till/Paybill via M-Pesa
 *  2. Safaricom POSTs to our /daraja/confirmation
 *  3. We look up which business owns that shortcode
 *  4. We store the transaction in our DB
 *  5. We forward the event to the business's webhook_url (if set)
 *  6. We return 200 to Safaricom immediately
 */

import { Router, Request, Response } from 'express';
import {
  getBusinessByShortcode,
  createTransaction,
  getTransactionByTransId,
} from '../db/database';
import { forwardPaymentEvent } from '../services/webhook-forwarder';
import { extractStatusResultParams } from '../services/transaction-status';

const router = Router();

// ─── Confirmation ──────────────────────────────────────────────────────────────
// Safaricom calls this after the payment has been successfully processed.
// We MUST respond with HTTP 200 quickly. All heavy work is async.

router.get('/confirmation', (req: Request, res: Response) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

router.post('/confirmation', async (req: Request, res: Response) => {
  // Immediately respond to Safaricom so it doesn't retry
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const body = req.body;
  console.log('[Confirmation] Received:', JSON.stringify(body));

  const {
    TransID,
    TransAmount,
    BusinessShortCode,
    MSISDN,
    FirstName,
    MiddleName,
    LastName,
    BillRefNumber,
    InvoiceNumber,
    OrgAccountBalance,
    TransactionType,
  } = body;

  // Guard: ignore if missing critical fields
  if (!TransID || !BusinessShortCode || !MSISDN) {
    console.warn('[Confirmation] Skipping - missing critical fields');
    return;
  }

  // Guard: idempotency - ignore duplicates
  const existing = getTransactionByTransId(TransID);
  if (existing) {
    console.warn(`[Confirmation] Duplicate TransID ${TransID} - ignoring`);
    return;
  }

  // Find which business owns this shortcode
  const business = getBusinessByShortcode(String(BusinessShortCode));
  if (!business) {
    console.warn(`[Confirmation] No business registered for shortcode ${BusinessShortCode}`);
    return;
  }

  // Store the transaction
  const transaction = createTransaction({
    transId: TransID,
    businessId: business.id,
    shortcode: String(BusinessShortCode),
    phone: MSISDN,
    amount: parseFloat(TransAmount) || 0,
    billRef: BillRefNumber || InvoiceNumber || null,
    firstName: FirstName || '',
    middleName: MiddleName || null,
    lastName: LastName || '',
    transactionType: TransactionType || 'CustomerPayBillOnline',
    orgBalance: OrgAccountBalance || null,
  });

  console.log(`[Confirmation] Stored transaction ${TransID} for business ${business.name}`);

  // Forward to business webhook if configured
  if (business.webhook_url) {
    forwardPaymentEvent(transaction, business.webhook_url, business.id).catch((err) => {
      console.error('[Confirmation] Webhook forward error:', err.message);
    });
  }
});

// ─── Validation ────────────────────────────────────────────────────────────────
// Safaricom calls this BEFORE processing the payment.
// We accept all payments by default. You can add business logic here.

router.get('/validation', (req: Request, res: Response) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

router.post('/validation', (req: Request, res: Response) => {
  const body = req.body;
  console.log('[Validation] Received:', JSON.stringify(body));

  const { BusinessShortCode } = body;

  // Check if shortcode is registered with us
  const business = getBusinessByShortcode(String(BusinessShortCode));
  if (!business) {
    console.warn(`[Validation] Unknown shortcode ${BusinessShortCode} - rejecting`);
    // Reject unknown shortcodes
    res.status(200).json({ ResultCode: 1, ResultDesc: 'Rejected - unknown business' });
    return;
  }

  // Accept the payment
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// ─── Transaction Status Result ─────────────────────────────────────────────────
// Daraja calls this asynchronously after we POST to /mpesa/transactionstatus/v6/query.
// We log the result; extend this to update DB or notify business if needed.

router.post('/result', (req: Request, res: Response) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const body = req.body;
  console.log('[TransactionStatus Result]', JSON.stringify(body));

  const result = body?.Result;
  if (!result) return;

  const code = result.ResultCode;
  const transId = result.TransactionID;
  const params = extractStatusResultParams(body);

  if (code === 0) {
    console.log(`[TransactionStatus] ${transId} verified — Status: ${params.TransactionStatus}, Amount: ${params.Amount}`);
  } else {
    console.warn(`[TransactionStatus] ${transId} query failed — Code: ${code}, Desc: ${result.ResultDesc}`);
  }
});

// ─── Transaction Status Timeout ────────────────────────────────────────────────
// Daraja calls this if the status query times out on their side.

router.post('/timeout', (req: Request, res: Response) => {
  console.warn('[TransactionStatus Timeout]', JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

export default router;
