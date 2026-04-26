/**
 * @fileoverview Webhook forwarder
 *
 * When a payment arrives, this service fires the event to the
 * business's registered webhook_url (if they have one) with retry logic.
 */

import axios from 'axios';
import { Transaction, logWebhookAttempt, markWebhookDelivered } from '../db/database';

export interface WebhookPayload {
  event: 'payment.received';
  transId: string;
  shortcode: string;
  phone: string;
  amount: number;
  billRef: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  transactionType: string;
  timestamp: string;
}

/**
 * Fires the payment event to the business's webhook URL.
 * Retries up to 3 times with exponential backoff.
 */
export async function forwardPaymentEvent(
  transaction: Transaction,
  webhookUrl: string,
  businessId: string
): Promise<void> {
  const payload: WebhookPayload = {
    event: 'payment.received',
    transId: transaction.trans_id,
    shortcode: transaction.shortcode,
    phone: transaction.phone,
    amount: transaction.amount,
    billRef: transaction.bill_ref,
    firstName: transaction.first_name,
    middleName: transaction.middle_name,
    lastName: transaction.last_name,
    transactionType: transaction.transaction_type,
    timestamp: transaction.created_at,
  };

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await axios.post(webhookUrl, payload, {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          'X-Tatua-Event': 'payment.received',
          'X-Tatua-TransID': transaction.trans_id,
        },
      });

      logWebhookAttempt({
        transactionId: transaction.id,
        businessId,
        targetUrl: webhookUrl,
        statusCode: response.status,
        delivered: true,
        attempt,
      });

      markWebhookDelivered(transaction.id);
      console.log(`[Webhook] Delivered to ${webhookUrl} (attempt ${attempt})`);
      return;

    } catch (error: any) {
      const statusCode = error?.response?.status ?? null;

      logWebhookAttempt({
        transactionId: transaction.id,
        businessId,
        targetUrl: webhookUrl,
        statusCode,
        delivered: false,
        attempt,
      });

      console.warn(`[Webhook] Attempt ${attempt} failed for ${webhookUrl}: ${error.message}`);

      if (attempt < MAX_ATTEMPTS) {
        // Exponential backoff: 2s, 4s
        await sleep(2000 * attempt);
      }
    }
  }

  console.error(`[Webhook] All ${MAX_ATTEMPTS} attempts failed for ${webhookUrl}, transaction ${transaction.trans_id}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
