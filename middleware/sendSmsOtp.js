/**
 * Sends an OTP via SMS using the configured provider (Twilio or Termii).
 * Reads SMS_PROVIDER from environment variables to decide the provider.
 *
 * @param {string} phoneNumber - The recipient's phone number.
 * @param {string} otp - The OTP string to send.
 * @throws {Error} If the provider is not configured or the SMS request fails.
 */
async function sendSmsOtp(phoneNumber, otp) {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();
  const message = `Your Crowdraise verification code is ${otp}. It expires in 10 minutes.`;

  if (provider === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
    }

    const body = new URLSearchParams({
      To: phoneNumber,
      From: from,
      Body: message
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Twilio SMS failed: ${err}`);
    }
    return;
  }

  if (provider === 'termii') {
    const apiKey = process.env.TERMII_API_KEY;
    const from = process.env.TERMII_SENDER_ID || 'N-Alert';
    if (!apiKey) {
      throw new Error('Termii is not configured. Set TERMII_API_KEY.');
    }

    const response = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phoneNumber,
        from,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: apiKey
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Termii SMS failed: ${err}`);
    }
    return;
  }

  throw new Error('SMS_PROVIDER must be set to "twilio" or "termii".');
}

module.exports = sendSmsOtp;
