/**
 * @fileoverview Database service using JSON file storage
 *
 * Simple, zero-dependency JSON file database.
 * In production, swap this for PostgreSQL (pg package).
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface Business {
  id: string;
  name: string;
  shortcode: string;
  shortcode_type: 'till' | 'paybill' | 'mobile';
  api_key: string;
  webhook_url: string | null;
  created_at: string;
  active: boolean;
}

export interface Transaction {
  id: string;
  trans_id: string;
  business_id: string;
  shortcode: string;
  phone: string;
  amount: number;
  bill_ref: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  transaction_type: string;
  org_balance: string | null;
  created_at: string;
  webhook_delivered: boolean;
}

export interface WebhookLog {
  id: string;
  transaction_id: string;
  business_id: string;
  target_url: string;
  status_code: number | null;
  delivered: boolean;
  attempt: number;
  created_at: string;
}

interface DbSchema {
  businesses: Business[];
  transactions: Transaction[];
  webhookLogs: WebhookLog[];
}

const DB_FILE = path.join(process.cwd(), 'tatua-db.json');

function loadDb(): DbSchema {
  if (!fs.existsSync(DB_FILE)) {
    const empty: DbSchema = { businesses: [], transactions: [], webhookLogs: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as DbSchema;
}

function saveDb(db: DbSchema): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function createBusiness(
  name: string,
  shortcode: string,
  shortcodeType: 'till' | 'paybill' | 'mobile',
  webhookUrl?: string
): Business {
  const db = loadDb();
  if (db.businesses.find((b) => b.shortcode === shortcode)) {
    throw new Error('UNIQUE constraint: shortcode already registered');
  }
  const business: Business = {
    id: uuidv4(),
    name,
    shortcode,
    shortcode_type: shortcodeType,
    api_key: 'tatua_' + uuidv4().replace(/-/g, ''),
    webhook_url: webhookUrl ?? null,
    created_at: new Date().toISOString(),
    active: true,
  };
  db.businesses.push(business);
  saveDb(db);
  return business;
}

export function getBusinessById(id: string): Business | null {
  return loadDb().businesses.find((b) => b.id === id) ?? null;
}

export function getBusinessByShortcode(shortcode: string): Business | null {
  return loadDb().businesses.find((b) => b.shortcode === shortcode && b.active) ?? null;
}

export function getBusinessByApiKey(apiKey: string): Business | null {
  return loadDb().businesses.find((b) => b.api_key === apiKey && b.active) ?? null;
}

export function listBusinesses(): Business[] {
  return loadDb().businesses.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function createTransaction(data: {
  transId: string;
  businessId: string;
  shortcode: string;
  phone: string;
  amount: number;
  billRef: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  transactionType: string;
  orgBalance: string | null;
}): Transaction {
  const db = loadDb();
  const transaction: Transaction = {
    id: uuidv4(),
    trans_id: data.transId,
    business_id: data.businessId,
    shortcode: data.shortcode,
    phone: data.phone,
    amount: data.amount,
    bill_ref: data.billRef,
    first_name: data.firstName,
    middle_name: data.middleName,
    last_name: data.lastName,
    transaction_type: data.transactionType,
    org_balance: data.orgBalance,
    created_at: new Date().toISOString(),
    webhook_delivered: false,
  };
  db.transactions.push(transaction);
  saveDb(db);
  return transaction;
}

export function getTransactionById(id: string): Transaction | null {
  return loadDb().transactions.find((t) => t.id === id) ?? null;
}

export function getTransactionByTransId(transId: string): Transaction | null {
  return loadDb().transactions.find((t) => t.trans_id === transId) ?? null;
}

export function listTransactionsByBusiness(
  businessId: string,
  opts: { limit?: number; offset?: number; from?: string; to?: string } = {}
): Transaction[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  let results = loadDb().transactions.filter((t) => {
    if (t.business_id !== businessId) return false;
    if (opts.from && t.created_at < opts.from) return false;
    if (opts.to && t.created_at > opts.to) return false;
    return true;
  });
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return results.slice(offset, offset + limit);
}

export function countTransactionsByBusiness(businessId: string): number {
  return loadDb().transactions.filter((t) => t.business_id === businessId).length;
}

export function markWebhookDelivered(transactionId: string): void {
  const db = loadDb();
  const txn = db.transactions.find((t) => t.id === transactionId);
  if (txn) { txn.webhook_delivered = true; saveDb(db); }
}

export function logWebhookAttempt(data: {
  transactionId: string;
  businessId: string;
  targetUrl: string;
  statusCode: number | null;
  delivered: boolean;
  attempt: number;
}): void {
  const db = loadDb();
  db.webhookLogs.push({
    id: uuidv4(),
    transaction_id: data.transactionId,
    business_id: data.businessId,
    target_url: data.targetUrl,
    status_code: data.statusCode,
    delivered: data.delivered,
    attempt: data.attempt,
    created_at: new Date().toISOString(),
  });
  saveDb(db);
}
