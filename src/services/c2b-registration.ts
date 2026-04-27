/**
 * @fileoverview C2B URL registration service
 *
 * Registers the gateway's single confirmation + validation URL
 * with Safaricom for a given shortcode. This only needs to be
 * called once per shortcode.
 */

import axios from 'axios';
import { getDarajaToken, getDarajaBaseUrl } from './daraja-auth';

export interface RegisterC2BResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Registers the gateway's webhook URLs for a shortcode with Safaricom.
 * After this call, Safaricom will POST all payments for that shortcode
 * to the gateway's /daraja/confirmation and /daraja/validation endpoints.
 */
export async function registerC2BUrls(shortcode: string): Promise<RegisterC2BResult> {
  const baseUrl = process.env.GATEWAY_BASE_URL;
  if (!baseUrl) {
    throw new Error('GATEWAY_BASE_URL must be set in .env');
  }

  const confirmationURL = `${baseUrl}/daraja/confirmation`;
  const validationURL = `${baseUrl}/daraja/validation`;

  try {
    const token = await getDarajaToken();

    const payload = {
      ShortCode: shortcode,
      ResponseType: 'Completed',
      ConfirmationURL: confirmationURL,
      ValidationURL: validationURL,
    };

    const response = await axios.post(
      `${getDarajaBaseUrl()}/mpesa/c2b/v2/registerurl`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`[C2B] URLs registered for shortcode ${shortcode}:`, response.data);

    return {
      success: true,
      message: `C2B URLs registered for shortcode ${shortcode}`,
      data: response.data,
    };
  } catch (error: any) {
    const responseData = error?.response?.data;
    const msg = responseData
      ? JSON.stringify(responseData)
      : error?.message || 'Unknown error';
    console.error(`[C2B] Full error for ${shortcode}:`, msg);
    console.error(`[C2B] Status:`, error?.response?.status);
    return { success: false, message: msg };
  }
}