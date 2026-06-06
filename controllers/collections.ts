const Collection = require('../models/collection');
import type { Request, Response } from 'express';
const User = require('../models/user');
import type { CollectionQuery, AuthenticatedRequest } from '../lib/types';

const getAllCollections = async (req: Request, res: Response) => {
  try {
    const {
      status,
      category,
      type,
      search,
      creator,
      sort = '-createdAt', // default: newest first
      page = 1,
      limit = 10,
      featured
    } = req.query;

    const query: CollectionQuery = {};

    // Filtering
    if (status) query.status = status;
    if (category) query.category = category;
    if (type) query.type = type;
    if (creator) query.creator = creator;
    if (typeof featured !== 'undefined') query.featured = featured === 'true' ? true : false;

    // Search (text index)
    if (typeof search === 'string' && search.trim().length > 0) {
      query.$text = { $search: search };
    }

    // Ensure page and limit are numbers
    const parsedPage = typeof page === 'string' ? parseInt(page, 10) : Number(page) || 1;
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : Number(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    // Query and count
    const [collections, total] = await Promise.all([
      Collection.find(query)
        .sort(sort as string)
        .skip(skip)
        .limit(parsedLimit)
        .populate('creator', 'name email role'),
      Collection.countDocuments(query)
    ]);

    res.status(200).json({
      message: 'Collections fetched',
      count: total,
      page: parsedPage,
      pageSize: collections.length,
      totalPages: Math.ceil(total / parsedLimit),
      data: collections
    });
  } catch (err) {
    const errorMsg =
      (err instanceof Error)
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? (err as any).message
          : 'Internal server error';
    res.status(500).json({ error: errorMsg });
  }
};

const getCollectionById = async (req: Request, res: Response) => {
  try {
    const collection = await Collection.findById(req.params.collectionId)
      .populate('creator', 'name email role');
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }
    res.status(200).json(collection);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

const createCollection = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const creator = await User.findById(req.user.userId).select('emailVerified').exec();
    if (!creator) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!creator.emailVerified) {
      return res.status(403).json({
        message: 'Email verification is required before creating your first live collection.'
      });
    }

    // Always use ID from token for creator to prevent forgery
    const collection = new Collection({
      ...req.body,
      status: req.body.status === 'draft' ? 'draft' : 'active',
      creator: req.user.userId
    });

    await collection.save();
    res.status(201).json({
      message: 'Collection created',
      data: collection
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

const updateCollection = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Fetch the collection to update
    const collection = await Collection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    // Do not allow updates if collection is completed (custom business logic)
    if (collection.status === 'completed' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Completed collections cannot be edited.' });
    }

    Object.assign(collection, req.body);

    await collection.save();
    res.status(200).json({
      message: 'Collection updated',
      data: collection
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

const deleteCollection = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await Collection.findByIdAndDelete(req.params.collectionId);
    res.status(200).json({ message: 'Collection deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAllCollections, getCollectionById, createCollection,updateCollection, deleteCollection };