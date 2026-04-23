var twilio = require('twilio');
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
    const client = twilio(accountSid, authToken);
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
    }

    // const body = new URLSearchParams({
    //   To: phoneNumber,
    //   From: from,
    //   Body: message
    // });

    // const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    //   method: 'POST',
    //   headers: {
    //     Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    //     'Content-Type': 'application/x-www-form-urlencoded'
    //   },
    //   body
    // });
    const twiliomessage = await client.messages.create({
      body: message,
      from,
      to: "18777804236",
    });

    if (!twiliomessage.body) {
      // const err = await message.text();
      throw new Error(`Twilio SMS failed`);
    }
    return;
  }

  throw new Error('SMS_PROVIDER must be set to "twilio".');
}

module.exports = sendSmsOtp;
