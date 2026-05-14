const https = require('https');

// ─── Helper: make an HTTPS request ──────────────────────────────────────────
function paystackRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`Paystack error [${res.statusCode}]: ${json.message || data}`));
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

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    ...extra,
  };
}

// ─── Transaction: Initialize ─────────────────────────────────────────────────
const initializePaystackTransaction = (data) => {
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
const verifyPaystackTransaction = (reference) => {
  return paystackRequest({
    hostname: 'api.paystack.co',
    port: 443,
    path: `/transaction/verify/${encodeURIComponent(reference)}`,
    method: 'GET',
    headers: authHeaders(),
  });
};

// ─── Banks: List Nigerian banks ───────────────────────────────────────────────
const listBanks = () => {
  return paystackRequest({
    hostname: 'api.paystack.co',
    port: 443,
    path: '/bank?currency=NGN&perPage=100',
    method: 'GET',
    headers: authHeaders(),
  });
};

// ─── Account: Resolve (verify account number) ────────────────────────────────
const resolveAccountNumber = (accountNumber, bankCode) => {
  return paystackRequest({
    hostname: 'api.paystack.co',
    port: 443,
    path: `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    method: 'GET',
    headers: authHeaders(),
  });
};

// ─── Transfer: Create recipient ───────────────────────────────────────────────
const createTransferRecipient = (accountName, accountNumber, bankCode) => {
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
const initiateTransfer = (amountNaira, recipientCode, reason, reference) => {
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