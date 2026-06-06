import { Request, Response } from 'express';
import { Contribution, Collection } from '../models';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { NotFoundError } from '../src/utils/errors';
import { initializeTransaction, verifyTransaction } from '../src/services/paymentService';

const PLATFORM_FEE_RATES: Record<string, number> = { fundraiser: 1, occasion: 3, tips: 3 };

export const initializeContribution = asyncHandler(async (req: Request, res: Response) => {
  const { collectionId, amount } = req.body;
  const collection = await Collection.findById(collectionId);
  if (!collection) throw new NotFoundError('Collection');
  if (collection.status !== 'active') throw new NotFoundError('Active collection');

  const feePercentage = PLATFORM_FEE_RATES[collection.type] || 1;
  const platformFee = Math.round(amount * (feePercentage / 100));
  const netAmount = amount - platformFee;

  const contribution = await Contribution.create({
    collection: collection._id,
    collectionTitle: collection.title,
    collectionType: collection.type,
    collectionCreator: collection.creator,
    supporterName: req.body.supporterName || 'Anonymous',
    supporterEmail: req.body.supporterEmail,
    amount,
    feePercentage,
    platformFee,
    netAmount,
    message: req.body.message,
    isAnonymous: req.body.isAnonymous || false,
    paystackReference: `CR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  const paystackRes = await initializeTransaction({
    email: req.body.supporterEmail || 'supporter@example.com',
    amount: amount * 100,
    reference: contribution.paystackReference,
    metadata: { contributionId: contribution._id.toString(), collectionId },
  });

  contribution.paystackReference = paystackRes.data?.reference || contribution.paystackReference;
  await contribution.save();

  res.status(201).json({
    message: 'Contribution initialized',
    data: { _id: contribution._id },
    access_code: paystackRes.data?.access_code,
    authorization_url: paystackRes.data?.authorization_url,
  });
});

export const confirmContribution = asyncHandler(async (req: Request, res: Response) => {
  const contribution = await Contribution.findById(req.params.contributionId);
  if (!contribution) throw new NotFoundError('Contribution');
  if (contribution.processed) {
    res.status(200).json({ message: 'Contribution already confirmed', data: contribution });
    return;
  }

  const verification = await verifyTransaction(contribution.paystackReference);
  if (verification.status && verification.data) {
    const updated = await Contribution.confirmAndUpdateCounters(contribution._id.toString());
    res.status(200).json({ message: 'Contribution confirmed', data: updated || contribution });
  } else {
    contribution.status = 'failed';
    await contribution.save();
    res.status(400).json({ message: 'Payment verification failed' });
  }
});

export const getCollectionContributions = asyncHandler(async (req: Request, res: Response) => {
  const contributions = await Contribution.find({ collection: req.params.collectionId, status: 'completed' }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ message: 'Contributions fetched', data: contributions });
});

export const getPlatformRevenueSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const agg = await Contribution.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, totalGrossDonated: { $sum: '$amount' }, totalPlatformRevenue: { $sum: '$platformFee' }, totalContributions: { $sum: 1 } } },
  ]);
  res.status(200).json({ summary: agg[0] || { totalGrossDonated: 0, totalPlatformRevenue: 0, totalContributions: 0 } });
});

export const getAllContributions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const contributions = await Contribution.find({ status: 'completed' }).sort({ createdAt: -1 }).populate('collection', 'title').lean();
  res.status(200).json({ message: 'All contributions', data: contributions });
});
