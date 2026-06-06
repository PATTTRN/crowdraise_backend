import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User, Withdrawal } from '../models';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { NotFoundError, AppError } from '../src/utils/errors';
import { getBalance } from '../src/services/balanceService';
import { listBanks, resolveAccount, createRecipient, initiateTransfer } from '../src/services/paymentService';
import { sendWithdrawalStatus } from '../src/services/emailService';
import { createNotification } from '../src/services/notificationService';

export const getBanks = asyncHandler(async (req: Request, res: Response) => {
  const result = await listBanks();
  res.status(200).json({ message: 'Banks fetched', data: result.data || [] });
});

export const verifyAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { accountNumber, bankCode } = req.body;
  const result = await resolveAccount(accountNumber, bankCode);
  if (!result.status || !result.data) throw new AppError(400, 'VERIFY_FAILED', 'Could not verify account');
  res.status(200).json({ message: 'Account verified', data: { accountName: result.data.account_name } });
});

export const saveBankDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByIdAndUpdate(req.user!.userId, { $set: { bankDetails: req.body } }, { new: true });
  if (!user) throw new NotFoundError('User');
  res.status(200).json({ message: 'Bank details saved', data: user.bankDetails });
});

export const getCreatorBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const balance = await getBalance(req.user!.userId);
  res.status(200).json({ message: 'Balance fetched', data: balance });
});

export const submitWithdrawalRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { amount } = req.body;
  const user = await User.findById(req.user!.userId);
  if (!user || !user.bankDetails?.accountNumber) throw new AppError(400, 'NO_BANK', 'Save bank details first');
  if (amount < 1000) throw new AppError(400, 'MIN_AMOUNT', 'Minimum withdrawal is ₦1,000');

  const balance = await getBalance(req.user!.userId);
  if (amount > balance.available) throw new AppError(400, 'INSUFFICIENT', `Only ₦${balance.available.toLocaleString()} available`);

  const withdrawal = await Withdrawal.create({
    creator: req.user!.userId,
    amount,
    bankDetails: user.bankDetails,
  });

  res.status(201).json({ message: 'Withdrawal request submitted', data: withdrawal });
});

export const getCreatorWithdrawalHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const withdrawals = await Withdrawal.find({ creator: req.user!.userId }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ message: 'Withdrawal history fetched', data: withdrawals });
});

export const getAllWithdrawals = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  const withdrawals = await Withdrawal.find(filter).populate('creator', 'name email').sort({ createdAt: -1 }).lean();
  res.status(200).json({ message: 'All withdrawals', data: withdrawals });
});

export const approveWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const withdrawal = await Withdrawal.findById(req.params.id).populate('creator');
  if (!withdrawal) throw new NotFoundError('Withdrawal');
  if (withdrawal.status !== 'pending') throw new AppError(400, 'NOT_PENDING', 'Withdrawal is not pending');

  const creator = await User.findById(withdrawal.creator);
  if (!creator?.bankDetails) throw new AppError(400, 'NO_BANK', 'Creator has no bank details');

  const recipient = await createRecipient(creator.bankDetails.accountName, creator.bankDetails.accountNumber, creator.bankDetails.bankCode);
  if (!recipient.data?.recipient_code) throw new AppError(400, 'PAYSTACK_ERROR', 'Failed to create recipient');

  const ref = `WD-${withdrawal._id}-${Date.now()}`;
  const transfer = await initiateTransfer(withdrawal.amount, recipient.data.recipient_code, 'Withdrawal payout', ref);

  withdrawal.status = 'approved';
  withdrawal.paystackRecipientCode = recipient.data.recipient_code;
  withdrawal.paystackTransferCode = (transfer as any).data?.transfer_code || '';
  withdrawal.paystackTransferReference = ref;
  withdrawal.processedBy = req.user!.userId as any;
  await withdrawal.save();

  if (creator.email && creator.notificationPrefs?.emailOnWithdrawal !== false) {
    sendWithdrawalStatus(creator.email, creator.name, withdrawal.amount, 'approved').catch(() => {});
  }
  await createNotification(withdrawal.creator.toString(), 'withdrawal_approved', `₦${withdrawal.amount.toLocaleString()} withdrawal approved`);

  res.status(200).json({ message: 'Withdrawal approved', data: withdrawal });
});

export const rejectWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const withdrawal = await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: 'rejected', adminNote: req.body.adminNote || '', processedBy: req.user!.userId } }, { new: true });
  if (!withdrawal) throw new NotFoundError('Withdrawal');
  const creator = await User.findById(withdrawal.creator);
  if (creator?.email && creator?.notificationPrefs?.emailOnWithdrawal !== false) {
    sendWithdrawalStatus(creator.email, creator.name, withdrawal.amount, 'rejected').catch(() => {});
  }
  res.status(200).json({ message: 'Withdrawal rejected', data: withdrawal });
});

export const markWithdrawalComplete = asyncHandler(async (req: AuthRequest, res: Response) => {
  const withdrawal = await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: 'completed', processedAt: new Date() } }, { new: true });
  if (!withdrawal) throw new NotFoundError('Withdrawal');
  res.status(200).json({ message: 'Withdrawal completed', data: withdrawal });
});
