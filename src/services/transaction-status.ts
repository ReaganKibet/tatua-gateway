import axios from 'axios';
import { getDarajaToken, getDarajaBaseUrl } from './daraja-auth';

export interface TransactionStatusResult {
  success: boolean;
  conversationId?: string;
  originatorConversationId?: string;
  message: string;
  data?: unknown;
}

/**
 * Submits an async transaction status query to Daraja.
 *
 * Daraja queues the request and POSTs the result to GATEWAY_BASE_URL/daraja/result.
 * Requires DARAJA_INITIATOR_NAME and DARAJA_SECURITY_CREDENTIAL in .env.
 *
 * SecurityCredential = initiator password encrypted with Safaricom's public cert.
 * Generate it once from the Daraja portal and paste as env var.
 *
 * identifierType: '1' = MSISDN, '2' = Till Number, '4' = Paybill shortcode
 */
export async function queryTransactionStatus(params: {
  transactionId: string;
  shortcode: string;
  identifierType?: '1' | '2' | '4';
  remarks?: string;
}): Promise<TransactionStatusResult> {
  const initiator = process.env.DARAJA_INITIATOR_NAME;
  const securityCredential = process.env.DARAJA_SECURITY_CREDENTIAL;
  const gatewayUrl = process.env.GATEWAY_BASE_URL;

  if (!initiator || !securityCredential) {
    throw new Error('DARAJA_INITIATOR_NAME and DARAJA_SECURITY_CREDENTIAL must be set in .env');
  }
  if (!gatewayUrl) {
    throw new Error('GATEWAY_BASE_URL must be set in .env');
  }

  const token = await getDarajaToken();

  const response = await axios.post(
    `${getDarajaBaseUrl()}/mpesa/transactionstatus/v6/query`,
    {
      Initiator: initiator,
      SecurityCredential: securityCredential,
      CommandID: 'TransactionStatusQuery',
      TransactionID: params.transactionId,
      PartyA: params.shortcode,
      IdentifierType: params.identifierType ?? '4',
      ResultURL: `${gatewayUrl}/daraja/result`,
      QueueTimeOutURL: `${gatewayUrl}/daraja/timeout`,
      Remarks: params.remarks ?? 'Status check',
      Occasion: '',
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    }
  );

  const { ConversationID, OriginatorConversationID } = response.data ?? {};
  console.log(`[TransactionStatus] Query submitted for ${params.transactionId} — ConversationID: ${ConversationID}`);

  return {
    success: true,
    conversationId: ConversationID,
    originatorConversationId: OriginatorConversationID,
    message: 'Transaction status query submitted. Result will arrive at /daraja/result.',
    data: response.data,
  };
}

/**
 * Parses Daraja's async result callback into a flat key-value map.
 * Call this inside the POST /daraja/result handler.
 */
export function extractStatusResultParams(body: unknown): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  const resultParams = (body as any)?.Result?.ResultParameters?.ResultParameter;
  if (Array.isArray(resultParams)) {
    for (const p of resultParams) {
      params[p.Key] = p.Value;
    }
  }
  return params;
}
