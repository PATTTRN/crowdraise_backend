import config from '../config';
import { httpsRequest } from '../utils/httpClient';
import { AppError } from '../utils/errors';

const paystackHeaders = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${config.paystack.secretKey}`,
  ...extra,
});

const api = {
  hostname: 'api.paystack.co',
  port: 443,
};

interface PaystackResponse<T = unknown> {
  status: boolean;
  message: string;
  data?: T;
}

export async function initializeTransaction(data: Record<string, unknown>) {
  return httpsRequest<PaystackResponse<{ access_code: string; reference: string; authorization_url: string }>>(
    { ...api, path: '/transaction/initialize', method: 'POST', headers: { ...paystackHeaders({ 'Content-Type': 'application/json' }) } },
    JSON.stringify(data)
  );
}

export async function verifyTransaction(reference: string) {
  return httpsRequest<PaystackResponse>(
    { ...api, path: `/transaction/verify/${encodeURIComponent(reference)}`, method: 'GET', headers: paystackHeaders() }
  );
}

export async function listBanks() {
  return httpsRequest<PaystackResponse<Array<{ name: string; code: string; id: number }>>>(
    { ...api, path: '/bank?currency=NGN&perPage=100', method: 'GET', headers: paystackHeaders() }
  );
}

export async function resolveAccount(accountNumber: string, bankCode: string) {
  return httpsRequest<PaystackResponse<{ account_name: string }>>(
    { ...api, path: `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, method: 'GET', headers: paystackHeaders() }
  );
}

export async function createRecipient(accountName: string, accountNumber: string, bankCode: string) {
  return httpsRequest<PaystackResponse<{ recipient_code: string; id: number }>>(
    { ...api, path: '/transferrecipient', method: 'POST', headers: { ...paystackHeaders({ 'Content-Type': 'application/json' }) } },
    JSON.stringify({ type: 'nuban', name: accountName, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' })
  );
}

export async function initiateTransfer(amountNaira: number, recipientCode: string, reason: string, reference: string) {
  return httpsRequest<PaystackResponse>(
    { ...api, path: '/transfer', method: 'POST', headers: { ...paystackHeaders({ 'Content-Type': 'application/json' }) } },
    JSON.stringify({ source: 'balance', amount: Math.round(amountNaira * 100), recipient: recipientCode, reason, reference })
  );
}

export async function refundTransaction(transactionReference: string) {
  return httpsRequest<PaystackResponse>(
    { ...api, path: '/refund', method: 'POST', headers: { ...paystackHeaders({ 'Content-Type': 'application/json' }) } },
    JSON.stringify({ transaction: transactionReference })
  );
}
