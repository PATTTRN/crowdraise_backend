const verifyPaystackTransaction = async (reference) => {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Paystack verification failed: ${response.status}`);
  }

  return response.json();
};

module.exports = { verifyPaystackTransaction };