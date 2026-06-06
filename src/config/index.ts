import dotenv from 'dotenv';
dotenv.config();

const required = [
  'MONGO_URI', 'JWT_KEY', 'PAYSTACK_SECRET_KEY',
] as const;

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI!,
  jwtKey: process.env.JWT_KEY!,
  jwtExpiry: process.env.JWT_EXPIRY || '72h',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3002',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(','),

  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY!,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
  },

  imagekit: {
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  },

  sms: {
    provider: process.env.SMS_PROVIDER,
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
  },

  otpExpiryMs: 10 * 60 * 1000,
  uploadMaxSize: 5 * 1024 * 1024,
  minWithdrawal: 1000,
  minContribution: 100,
  defaultPageSize: 12,
  notificationPollInterval: 30000,
} as const;

export default config;
