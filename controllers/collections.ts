import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Collection, User } from '../models';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { NotFoundError, AppError } from '../src/utils/errors';

const ALLOWED_UPDATE_FIELDS = ['title', 'category', 'description', 'fullStory', 'goal', 'images', 'eventDate', 'receiverName', 'suggestedAmounts', 'location'] as const;

export const getAllCollections = asyncHandler(async (req: Request, res: Response) => {
  const { status, category, type, search, creator, sort: sortRaw, page: pageRaw, limit: limitRaw, featured } = req.query;
  const sort = (sortRaw as string) || '-createdAt';
  const parsedPage = Math.max(1, parseInt((pageRaw as string) || '1', 10));
  const parsedLimit = Math.min(50, Math.max(1, parseInt((limitRaw as string) || '10', 10)));
  const skip = (parsedPage - 1) * parsedLimit;

  const filter: any = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (type) filter.type = type;
  if (creator) filter.creator = creator;
  if (featured !== undefined) filter.featured = featured === 'true';
  if (typeof search === 'string' && search.trim()) filter.$text = { $search: search };

  const [collections, total] = await Promise.all([
    Collection.find(filter).sort(sort as any).skip(skip).limit(parsedLimit).populate('creator', 'name email role'),
    Collection.countDocuments(filter),
  ]);

  res.status(200).json({ message: 'Collections fetched', count: total, page: parsedPage, pageSize: collections.length, totalPages: Math.ceil(total / parsedLimit), data: collections });
});

export const getCollectionById = asyncHandler(async (req: Request, res: Response) => {
  const collection = await Collection.findById(req.params.collectionId).populate('creator', 'name email role');
  if (!collection) throw new NotFoundError('Collection');
  res.status(200).json(collection);
});

export const createCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const creator = await User.findById(req.user!.userId).select('emailVerified');
  if (!creator) throw new NotFoundError('User');
  if (!creator.emailVerified) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email verification required before creating a live collection');

  const collection = await Collection.create({ ...req.body, creator: req.user!.userId } as any);
  res.status(201).json({ message: 'Collection created', data: collection });
});

export const updateCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const collection = await Collection.findById(req.params.collectionId);
  if (!collection) throw new NotFoundError('Collection');
  if (collection.status === 'completed' && req.user?.role !== 'admin') {
    throw new AppError(403, 'COMPLETED', 'Completed collections cannot be edited');
  }

  const allowedFields = ALLOWED_UPDATE_FIELDS as readonly string[];
  Object.keys(req.body).forEach((key) => {
    if ((allowedFields as readonly string[]).includes(key) && req.body[key] !== undefined) {
      (collection as any)[key] = req.body[key];
    }
  });
  await collection.save();

  res.status(200).json({ message: 'Collection updated', data: collection });
});

export const deleteCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await Collection.findByIdAndDelete(req.params.collectionId);
  if (!result) throw new NotFoundError('Collection');
  res.status(200).json({ message: 'Collection deleted' });
});

export const addUpdate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const collection = await Collection.findOneAndUpdate(
    { _id: req.params.collectionId, creator: req.user!.userId },
    { $push: { updates: { message: req.body.message, createdAt: new Date() } } },
    { new: true }
  );
  if (!collection) throw new NotFoundError('Collection');
  res.status(200).json({ message: 'Update added', data: collection.updates });
});

export const moderateCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { action, rejectionReason } = req.body;
  const update: Record<string, unknown> = action === 'approve' ? { status: 'active' } : { status: 'rejected', rejectionReason: rejectionReason || '' };
  const collection = await Collection.findByIdAndUpdate(req.params.collectionId, update, { new: true });
  if (!collection) throw new NotFoundError('Collection');

  const { AuditLog } = await import('../models');
  await AuditLog.create({ admin: req.user!.userId, action: action === 'approve' ? 'approve_collection' : 'reject_collection', target: 'collection', targetId: collection._id });

  res.status(200).json({ message: `Collection ${action}d`, data: collection });
});

async function attachCreatorTrust(collections: Record<string, unknown>[]) {
  const creatorIds = [...new Set(collections.map((c: any) => c.creator?._id?.toString()).filter(Boolean))];
  const statsMap: Record<string, { completedCount: number; totalRaised: number }> = {};
  if (creatorIds.length > 0) {
    const agg = await Collection.aggregate([
      { $match: { creator: { $in: creatorIds.map((id: string) => new mongoose.Types.ObjectId(id)) }, status: 'completed' } },
      { $group: { _id: '$creator', completedCount: { $sum: 1 }, totalRaised: { $sum: '$raised' } } },
    ]);
    agg.forEach((a: any) => { statsMap[a._id.toString()] = a; });
  }
  return collections.map((c: any) => ({
    ...c,
    creatorTrust: { completedCampaigns: statsMap[c.creator?._id?.toString()]?.completedCount || 0, totalRaised: statsMap[c.creator?._id?.toString()]?.totalRaised || 0, isVerified: (statsMap[c.creator?._id?.toString()]?.completedCount || 0) >= 3 || (statsMap[c.creator?._id?.toString()]?.totalRaised || 0) >= 500000 },
  }));
}

const getWithTrust = (filter: any, sort: any, limit: number) =>
  asyncHandler(async (req: Request, res: Response) => {
    const collections = await Collection.find(filter).sort(sort).limit(limit).populate('creator', 'name email').lean();
    const data = await attachCreatorTrust(collections as any[]);
    res.status(200).json({ message: `${Object.keys(filter).join(',')} collections`, data });
  });

export const getFeatured = getWithTrust({ featured: true, status: 'active' }, { createdAt: -1 }, 3);
export const getTrending = getWithTrust({ status: 'active' }, { supporters: -1, createdAt: -1 }, 6);
export const getAlmostFunded = getWithTrust({ status: 'active', goal: { $gt: 0 }, $expr: { $gte: [{ $divide: ['$raised', '$goal'] }, 0.9] } }, { raised: -1 }, 3);
