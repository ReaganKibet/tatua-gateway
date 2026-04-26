/**
 * @fileoverview Daraja OAuth service
 *
 * Manages a single cached access token for the gateway's Daraja credentials.
 * All STK, C2B registration, and pull calls go through this single token.
 */

import axios from 'axios';

interface TokenCache {
  token: string;
  fetchedAt: number;
  expiresInMs: number;
}

let cache: TokenCache | null = null;
let pendingFetch: Promise<string> | null = null;

function getBaseUrl(): string {
  return process.env.DARAJA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

export function getDarajaBaseUrl(): string {
  return getBaseUrl();
}

export async function getDarajaToken(): Promise<string> {
  // If already fetching, wait for it (prevents concurrent requests)
  if (pendingFetch) return pendingFetch;

  // Return cached token if still valid (with 60s buffer)
  if (cache) {
    const elapsed = Date.now() - cache.fetchedAt;
    if (elapsed < cache.expiresInMs - 60_000) {
      return cache.token;
    }
  }

  // Fetch fresh token
  pendingFetch = fetchToken().finally(() => { pendingFetch = null; });
  return pendingFetch;
}

async function fetchToken(): Promise<string> {
  const key = process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.DARAJA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error('DARAJA_CONSUMER_KEY and DARAJA_CONSUMER_SECRET must be set in .env');
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const url = `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

  const response = await axios.get<{ access_token: string; expires_in: string }>(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  const { access_token, expires_in } = response.data;

  cache = {
    token: access_token,
    fetchedAt: Date.now(),
    expiresInMs: parseInt(expires_in) * 1000,
  };

  console.log(`[Auth] Token refreshed. Expires in ${expires_in}s`);
  return access_token;
}

export function clearTokenCache(): void {
  cache = null;
}
