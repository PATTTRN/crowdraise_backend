import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Contribution, Collection, Withdrawal, User, Notification } from '../models';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { NotFoundError, AppError } from '../src/utils/errors';
import { refundTransaction } from '../src/services/paymentService';
import { sendContributionReceived, sendWithdrawalStatus } from '../src/services/emailService';
import { createNotification } from '../src/services/notificationService';
import config from '../src/config';

export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
  const secret = config.paystack.webhookSecret;
  const signature = req.headers['x-paystack-signature'] as string;

  if (secret) {
    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== signature) { res.status(401).json({ message: 'Invalid signature' }); return; }
  }

  const event = req.body;
  const data = event.data;

  switch (event.event) {
    case 'charge.success': {
      const contribution = await Contribution.findOne({ paystackReference: data.reference });
      if (!contribution || contribution.processed) break;

      const updated = await Contribution.confirmAndUpdateCounters(contribution._id.toString());
      if (updated) {
        const creator = await User.findById(contribution.collectionCreator);
        if (creator?.email && creator?.notificationPrefs?.emailOnContribution !== false) {
          sendContributionReceived(creator.email, creator.name, contribution.supporterName || 'Someone', contribution.amount, contribution.collectionTitle).catch(() => {});
        }
        await createNotification(contribution.collectionCreator.toString(), 'contribution_received', `₦${contribution.amount.toLocaleString()} received`, `${contribution.supporterName || 'Someone'} contributed to ${contribution.collectionTitle}`);
      }
      break;
    }

    case 'transfer.success': {
      const withdrawal = await Withdrawal.findOne({ paystackTransferReference: data.reference });
      if (!withdrawal) break;
      withdrawal.status = 'completed';
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      const creator = await User.findById(withdrawal.creator);
      if (creator?.email && creator?.notificationPrefs?.emailOnWithdrawal !== false) {
        sendWithdrawalStatus(creator.email, creator.name, withdrawal.amount, 'completed').catch(() => {});
      }
      await createNotification(withdrawal.creator.toString(), 'withdrawal_completed', `₦${withdrawal.amount.toLocaleString()} withdrawal completed`);
      break;
    }

    case 'transfer.failed': {
      const withdrawal = await Withdrawal.findOne({ paystackTransferReference: data.reference });
      if (!withdrawal) break;
      withdrawal.status = 'pending';
      await withdrawal.save();
      break;
    }
  }

  res.status(200).json({ message: 'Webhook processed' });
});

export const refundContribution = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const contribution = await Contribution.findById(req.params.contributionId).session(session);
    if (!contribution) throw new NotFoundError('Contribution');
    if (contribution.status !== 'completed') throw new AppError(400, 'NOT_COMPLETED', 'Contribution must be completed to refund');

    const result: any = await refundTransaction(contribution.paystackReference);
    if (!result.status) throw new AppError(400, 'REFUND_FAILED', 'Refund failed');

    contribution.status = 'refunded';
    contribution.refundedAt = new Date();
    contribution.refundReference = result.data?.reference || '';
    await contribution.save({ session });

    await Collection.findByIdAndUpdate(contribution.collection, { $inc: { raised: -contribution.amount, supporters: -1 } }, { session });

    const { AuditLog } = await import('../models');
    await AuditLog.create([{ admin: req.user!.userId, action: 'refund_contribution', target: 'contribution', targetId: contribution._id, details: { amount: contribution.amount } }], { session });

    await session.commitTransaction();
    res.status(200).json({ message: 'Contribution refunded', data: contribution });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
