const https = require('https');
const http = require('http');

// ─── Helper: make an HTTPS request ──────────────────────────────────────────
function paystackRequest(
  options: import('http').RequestOptions,
  body?: string | null
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res: import('http').IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(
              new Error(`Paystack error [${res.statusCode}]: ${json.message || data}`)
            );
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function authHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    ...extra,
  };
}

// ─── Transaction: Initialize ─────────────────────────────────────────────────
const initializePaystackTransaction = (
  data: Record<string, any>
): Promise<any> => {
  const params = JSON.stringify(data);
  return paystackRequest(
    {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: { ...authHeaders({ 'Content-Type': 'application/json' }) },
    },
    params
  );
};

// ─── Transaction: Verify ─────────────────────────────────────────────────────
const verifyPaystackTransaction = (reference: string): Promise<any> => {
  return paystackRequest({
    hostname: 'api.paystack.co',
    port: 443,
    path: `/transaction/verify/${encodeURIComponent(reference)}`,
    method: 'GET',
    headers: authHeaders(),
  });
};

// ─── Banks: List Nigerian banks ───────────────────────────────────────────────
const listBanks = (): Promise<any> => {
  return paystackRequest({
    hostname: 'api.paystack.co',
    port: 443,
    path: '/bank?currency=NGN&perPage=100',
    method: 'GET',
    headers: authHeaders(),
  });
};

// ─── Account: Resolve (verify account number) ────────────────────────────────
const resolveAccountNumber = (
  accountNumber: string,
  bankCode: string
): Promise<any> => {
  return paystackRequest({
    hostname: 'api.paystack.co',
    port: 443,
    path: `/bank/resolve?account_number=${encodeURIComponent(
      accountNumber
    )}&bank_code=${encodeURIComponent(bankCode)}`,
    method: 'GET',
    headers: authHeaders(),
  });
};

// ─── Transfer: Create recipient ───────────────────────────────────────────────
const createTransferRecipient = (
  accountName: string,
  accountNumber: string,
  bankCode: string
): Promise<any> => {
  const params = JSON.stringify({
    type: 'nuban',
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: 'NGN',
  });
  return paystackRequest(
    {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transferrecipient',
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    },
    params
  );
};

// ─── Transfer: Initiate ───────────────────────────────────────────────────────
// amount should be in NGN (naira) — this function converts to kobo
const initiateTransfer = (
  amountNaira: number,
  recipientCode: string,
  reason: string,
  reference: string
): Promise<any> => {
  const params = JSON.stringify({
    source: 'balance',
    amount: Math.round(amountNaira * 100), // convert to kobo
    recipient: recipientCode,
    reason,
    reference,
  });
  return paystackRequest(
    {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transfer',
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    },
    params
  );
};

module.exports = {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  listBanks,
  resolveAccountNumber,
  createTransferRecipient,
  initiateTransfer,
};