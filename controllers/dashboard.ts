import { Response } from 'express';
import mongoose from 'mongoose';
import { Collection, Contribution, Withdrawal } from '../models';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { getBalance } from '../src/services/balanceService';

export const getDashboardSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const objectId = new mongoose.Types.ObjectId(userId);

  const [collectionsAgg, contributionsAgg] = await Promise.all([
    Collection.aggregate([
      { $match: { creator: objectId } },
      { $facet: {
        stats: [{ $group: { _id: null, totalCollections: { $sum: 1 }, activeCollections: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, completedCollections: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, totalRaised: { $sum: '$raised' }, totalSupporters: { $sum: '$supporters' } } }],
        recentCollections: [{ $sort: { createdAt: -1 } }, { $limit: 5 }, { $project: { title: 1, status: 1, raised: 1, goal: 1, supporters: 1, type: 1, images: 1, deadline: 1, createdAt: 1 } }],
      } },
    ]),
    Contribution.aggregate([
      { $match: { collectionCreator: objectId, status: 'completed' } },
      { $sort: { createdAt: -1 } },
      { $facet: {
        recent: [{ $limit: 10 }, { $project: { supporterName: 1, amount: 1, platformFee: 1, netAmount: 1, collectionTitle: 1, createdAt: 1, isAnonymous: 1 } }],
      } },
    ]),
  ]);

  const balance = await getBalance(userId);
  const colStats = collectionsAgg[0]?.stats?.[0] || {};
  const totalCollections = colStats.totalCollections || 0;
  const totalSupporters = colStats.totalSupporters || 0;

  res.status(200).json({
    message: 'Dashboard summary fetched',
    data: {
      stats: {
        totalCollections,
        activeCollections: colStats.activeCollections || 0,
        completedCollections: colStats.completedCollections || 0,
        totalRaised: colStats.totalRaised || 0,
        totalSupporters,
        totalContributions: contributionsAgg[0]?.stats?.[0]?.totalContributions || 0,
        averageDonation: totalSupporters > 0 ? Math.round((balance.totalGross || 0) / totalSupporters) : 0,
        completionRate: totalCollections > 0 ? Math.round(((colStats.completedCollections || 0) / totalCollections) * 100) : 0,
      },
      balance,
      recentCollections: collectionsAgg[0]?.recentCollections || [],
      recentContributions: contributionsAgg[0]?.recent || [],
    },
  });
});

export const getEarningsBreakdown = asyncHandler(async (req: AuthRequest, res: Response) => {
  const objectId = new mongoose.Types.ObjectId(req.user!.userId);
  const match: Record<string, unknown> = { collectionCreator: objectId, status: 'completed' };
  if (req.query.collectionId) match.collection = new mongoose.Types.ObjectId(req.query.collectionId as string);

  const earnings = await Contribution.aggregate([
    { $match: match },
    { $group: { _id: req.query.collectionId ? { collection: '$collection', collectionTitle: '$collectionTitle' } : null, totalGross: { $sum: '$amount' }, totalFees: { $sum: '$platformFee' }, totalNet: { $sum: '$netAmount' }, count: { $sum: 1 } } },
    { $sort: { totalNet: -1 } },
  ]);

  res.status(200).json({ message: 'Earnings fetched', data: req.query.collectionId ? (earnings[0] || null) : earnings });
});

export const getTransactionHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const objectId = new mongoose.Types.ObjectId(req.user!.userId);
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const type = req.query.type as string;
  const dateFilter: Record<string, Date> = {};
  if (req.query.from) dateFilter.$gte = new Date(req.query.from as string);
  if (req.query.to) dateFilter.$lte = new Date(req.query.to as string);

  const contribFilter: Record<string, unknown> = { collectionCreator: objectId, status: 'completed', ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) };
  const wdFilter: Record<string, unknown> = { creator: objectId, ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) };

  const [contributions, withdrawals] = await Promise.all([
    type !== 'withdrawal' ? Contribution.find(contribFilter).select('collectionTitle amount platformFee netAmount createdAt supporterName isAnonymous').sort({ createdAt: -1 }).lean() : [],
    type !== 'contribution' ? Withdrawal.find(wdFilter).select('amount status createdAt bankDetails').sort({ createdAt: -1 }).lean() : [],
  ]);

  const transactions: any[] = [
    ...(contributions as any[]).map((c: any) => ({ _id: c._id, type: 'contribution', description: `Contribution to ${c.collectionTitle}`, amount: c.amount, fee: c.platformFee, netAmount: c.netAmount, status: 'completed', date: c.createdAt, meta: { supporterName: c.supporterName, isAnonymous: c.isAnonymous } })),
    ...(withdrawals as any[]).map((w: any) => ({ _id: w._id, type: 'withdrawal', description: `Withdrawal to ${w.bankDetails?.bankName || 'bank'}`, amount: w.amount, fee: 0, netAmount: -w.amount, status: w.status, date: w.createdAt, meta: { accountNumber: w.bankDetails?.accountNumber } })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = transactions.length;
  res.status(200).json({ message: 'Transaction history', data: transactions.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

export const getAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const objectId = new mongoose.Types.ObjectId(req.user!.userId);
  const period = (req.query.period as string) || 'month';
  const fmt = period === 'day' ? '%Y-%m-%d' : period === 'week' ? '%G-W%V' : '%Y-%m';

  const [contributionsOverTime, topCollections] = await Promise.all([
    Contribution.aggregate([
      { $match: { collectionCreator: objectId, status: 'completed' } },
      { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt' } }, amount: { $sum: '$amount' }, count: { $sum: 1 }, fees: { $sum: '$platformFee' } } },
      { $sort: { _id: -1 } }, { $limit: 24 },
    ]),
    Collection.aggregate([
      { $match: { creator: objectId } },
      { $sort: { raised: -1 } }, { $limit: 10 },
      { $project: { title: 1, raised: 1, goal: 1, supporters: 1, status: 1 } },
    ]),
  ]);

  res.status(200).json({ message: 'Analytics fetched', data: { contributionsOverTime, topCollections } });
});

export const exportTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const objectId = new mongoose.Types.ObjectId(req.user!.userId);
  const cursor = Contribution.find({ collectionCreator: objectId, status: 'completed' }).select('collectionTitle amount platformFee netAmount createdAt supporterName').sort({ createdAt: -1 }).cursor();
  const wdCursor = Withdrawal.find({ creator: objectId }).select('amount status createdAt bankDetails').sort({ createdAt: -1 }).cursor();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
  res.write('Date,Type,Description,Amount,Fee,Net,Status\n');

  for await (const c of cursor) {
    res.write(`${(c as any).createdAt.toISOString()},Contribution,${(c as any).collectionTitle},${(c as any).amount},${(c as any).platformFee},${(c as any).netAmount},completed\n`);
  }
  for await (const w of wdCursor) {
    res.write(`${(w as any).createdAt.toISOString()},Withdrawal,${(w as any).bankDetails?.bankName || 'Bank'},${(w as any).amount},0,-${(w as any).amount},${(w as any).status}\n`);
  }
  res.end();
});
