import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './src/config';
import { getErrorStatus, getErrorMessage } from './src/utils/errors';

import authRouter from './routes/auth';
import collectionsRouter from './routes/collections';
import contributionsRouter from './routes/contributions';
import withdrawalsRouter from './routes/withdrawals';
import dashboardRouter from './routes/dashboard';
import uploadsRouter from './routes/uploads';
import paymentsRouter from './routes/payments';
import notificationsRouter from './routes/notifications';

const app = express();

// CORS
app.use(cors({
  origin: config.nodeEnv === 'production' ? config.allowedOrigins : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
}));

// Body parsing with limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(morgan('dev'));

// Rate limiters
const strictLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, message: { message: 'Too many requests. Please slow down.' }, standardHeaders: 'draft-8', legacyHeaders: false });
const generalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, message: { message: 'Too many requests. Please slow down.' }, standardHeaders: 'draft-8', legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, message: { message: 'Too many requests from this IP' }, standardHeaders: 'draft-8', legacyHeaders: false });

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

// API routes
const api = express.Router();
api.use('/auth', authLimiter, authRouter);
api.use('/collections', generalLimiter, collectionsRouter);
api.use('/contributions', generalLimiter, contributionsRouter);
api.use('/withdrawals', generalLimiter, withdrawalsRouter);
api.use('/dashboard', strictLimiter, dashboardRouter);
api.use('/upload', authLimiter, uploadsRouter);
api.use('/payments', paymentsRouter);
api.use('/notifications', authLimiter, notificationsRouter);

app.use('/api/v1', api);
app.use('/', api);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = getErrorStatus(err);
  const message = getErrorMessage(err);
  if (status === 500) console.error('[Error]', err);
  res.status(status).json({ error: message });
});

// MongoDB connection
mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log('MongoDB connected');
    const { startCampaignDeadlineCron } = require('./cron/campaignDeadline');
    startCampaignDeadlineCron();
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

export default app;
