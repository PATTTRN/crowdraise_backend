import { Resend } from 'resend';
import config from '../config';
import { AppError } from '../utils/errors';

let resend: Resend | null = null;
if (config.resend.apiKey) {
  resend = new Resend(config.resend.apiKey);
}

async function send({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!resend) {
    if (config.nodeEnv !== 'production') {
      console.warn(`[Email] Simulated: ${subject} -> ${to}`);
      return;
    }
    throw new AppError(500, 'EMAIL_CONFIG', 'Email not configured');
  }
  const { error } = await resend.emails.send({
    from: `Crowdraise <${config.resend.from}>`,
    to,
    subject,
    html,
  });
  if (error) throw error;
}

export async function sendOtpEmail(to: string, otp: string) {
  await send({
    to,
    subject: 'Your verification code',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#4f46e5">Verify your email</h2>
      <p>Use the code below. It expires in 10 minutes.</p>
      <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25rem;padding:16px 24px;background:#f3f4f6;border-radius:8px;display:inline-block">${otp}</div>
    </div>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await send({
    to,
    subject: 'Reset your password',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#4f46e5">Password Reset</h2>
      <p>Click the link below to reset your password (expires in 1 hour):</p>
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;margin:16px 0">Reset Password</a>
      <p style="color:#6b7280;font-size:0.875rem">If you did not request this, ignore this email.</p>
    </div>`,
  });
}

export async function sendContributionReceived(creatorEmail: string, creatorName: string, supporterName: string, amount: number, collectionTitle: string) {
  await send({
    to: creatorEmail,
    subject: `🎉 ₦${amount.toLocaleString()} contribution received`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#4f46e5">New Contribution!</h2><p>Hi ${creatorName},</p><p><strong>${supporterName || 'Someone'}</strong> contributed <strong>₦${amount.toLocaleString()}</strong> to <strong>${collectionTitle}</strong>.</p></div>`,
  });
}

export async function sendWithdrawalStatus(email: string, name: string, amount: number, status: string) {
  await send({
    to: email,
    subject: `Withdrawal ${status} — ₦${amount.toLocaleString()}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#4f46e5">Withdrawal ${status}</h2><p>Hi ${name},</p><p>Your withdrawal of <strong>₦${amount.toLocaleString()}</strong> has been <strong>${status}</strong>.</p></div>`,
  });
}

export async function sendCampaignCompleted(email: string, name: string, collectionTitle: string, totalRaised: number) {
  await send({
    to: email,
    subject: `🎊 ${collectionTitle} completed — ₦${totalRaised.toLocaleString()} raised`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#4f46e5">Campaign Completed!</h2><p>Hi ${name},</p><p>Your campaign <strong>${collectionTitle}</strong> raised <strong>₦${totalRaised.toLocaleString()}</strong>.</p></div>`,
  });
}
