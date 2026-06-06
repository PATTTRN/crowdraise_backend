import mongoose from 'mongoose';
import { Contribution, Withdrawal } from '../../models';

export interface BalanceResult {
  totalGross: number;
  totalFees: number;
  totalEarned: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  available: number;
}

export async function getBalance(userId: string): Promise<BalanceResult> {
  const objectId = new mongoose.Types.ObjectId(userId);

  const [contribAgg, withdrawalAgg] = await Promise.all([
    Contribution.aggregate([
      { $match: { collectionCreator: objectId, status: 'completed' } },
      { $group: { _id: null, totalGross: { $sum: '$amount' }, totalFees: { $sum: '$platformFee' }, totalNet: { $sum: '$netAmount' } } },
    ]),
    Withdrawal.aggregate([
      { $match: { creator: objectId } },
      { $group: { _id: null, totalWithdrawn: { $sum: { $cond: [{ $in: ['$status', ['completed', 'processing']] }, '$amount', 0] } }, pendingWithdrawals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } } } },
    ]),
  ]);

  const earnings = contribAgg[0] || { totalGross: 0, totalFees: 0, totalNet: 0 };
  const withdrawals = withdrawalAgg[0] || { totalWithdrawn: 0, pendingWithdrawals: 0 };

  return {
    totalGross: earnings.totalGross,
    totalFees: earnings.totalFees,
    totalEarned: earnings.totalNet,
    totalWithdrawn: withdrawals.totalWithdrawn,
    pendingWithdrawals: withdrawals.pendingWithdrawals,
    available: Math.max(0, earnings.totalNet - withdrawals.totalWithdrawn - withdrawals.pendingWithdrawals),
  };
}
