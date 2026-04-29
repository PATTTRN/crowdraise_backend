const { Resend } = require('resend');

/**
 * Sends an OTP via email using Resend.
 * Set RESEND_API_KEY and EMAIL_FROM in your environment variables.
 *
 * @param {string} toEmail - The recipient's email address.
 * @param {string} otp     - The OTP string to send.
 * @throws {Error} If the email fails to send.
 */
async function sendEmailOtp(toEmail, otp) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[sendEmailOtp] No RESEND_API_KEY found. Simulating email send for OTP:', otp);
      return;
    }
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const resend = new Resend(apiKey);
  // Defaults to onboarding@resend.dev which only allows sending to the email address associated with your Resend account.
  // For production, you must use a verified domain (e.g. no-reply@yourdomain.com).
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  const { data, error } = await resend.emails.send({
    from: `Crowdraise <${from}>`,
    to: toEmail,
    subject: 'Your Crowdraise verification code',
    text: `Your Crowdraise verification code is ${otp}. It expires in 10 minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#4f46e5">Verify your email</h2>
        <p>Use the code below to verify your Crowdraise account. It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25rem;padding:16px 24px;background:#f3f4f6;border-radius:8px;display:inline-block">
          ${otp}
        </div>
        <p style="margin-top:24px;color:#6b7280;font-size:0.875rem">
          If you did not request this, you can safely ignore this email.
        </p>
      </div>
    `
  });

  if (error) {
    console.error('[sendEmailOtp] Error sending email via Resend:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log('[sendEmailOtp] Email sent successfully:', data);
}

module.exports = sendEmailOtp;
