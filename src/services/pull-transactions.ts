import axios from 'axios';
import { getDarajaToken, getDarajaBaseUrl } from './daraja-auth';
import {
  getBusinessByShortcode,
  createTransaction,
  getTransactionByTransId,
} from '../db/database';

export interface PullTransactionsResult {
  success: boolean;
  synced: number;
  skipped: number;
  message: string;
  rawResponse?: unknown;
}

/**
 * Pulls C2B transactions from Daraja for a given shortcode and date range.
 * New transactions (not already in DB) are stored and deduplicated by TransID.
 *
 * Daraja returns max 10 per call — increment offset by 10 to paginate.
 */
export async function pullC2BTransactions(
  shortcode: string,
  startDate: string, // YYYYMMDD
  endDate: string,   // YYYYMMDD
  offset = 0
): Promise<PullTransactionsResult> {
  const token = await getDarajaToken();

  const response = await axios.post(
    `${getDarajaBaseUrl()}/pulltransactions/v1/query`,
    {
      ShortCode: shortcode,
      StartDate: startDate,
      EndDate: endDate,
      OffSetValue: String(offset),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    }
  );

  const rawData = response.data;
  const transactions: Record<string, string>[] = rawData?.Response ?? [];

  const business = getBusinessByShortcode(shortcode);
  if (!business) {
    return {
      success: false,
      synced: 0,
      skipped: 0,
      message: `No business registered for shortcode ${shortcode}`,
    };
  }

  let synced = 0;
  let skipped = 0;

  for (const txn of transactions) {
    const transId = txn.ReceiptNo;
    if (!transId) continue;

    if (getTransactionByTransId(transId)) {
      skipped++;
      continue;
    }

    createTransaction({
      transId,
      businessId: business.id,
      shortcode,
      phone: txn.Msisdn || '',
      amount: parseFloat(txn.Amount) || 0,
      billRef: txn.BillReferenceNumber || null,
      firstName: txn.FirstName || '',
      middleName: null,
      lastName: txn.LastName || '',
      transactionType: 'CustomerPayBillOnline',
      orgBalance: null,
    });

    synced++;
  }

  console.log(`[PullTransactions] shortcode=${shortcode} synced=${synced} skipped=${skipped}`);

  return {
    success: true,
    synced,
    skipped,
    message: `Pulled ${synced} new, skipped ${skipped} duplicate transactions`,
    rawResponse: rawData,
  };
}
