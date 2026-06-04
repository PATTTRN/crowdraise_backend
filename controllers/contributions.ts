import type { Request, Response } from 'express';
const { verifyPaystackTransaction, initializePaystackTransaction } = require('../middleware/paystack');
const Collection = require('../models/collection');
const Contribution = require('../models/contribution');

// Platform fee rates per collection type (as percentages)
const PLATFORM_FEE_RATES = {
    fundraiser: 1,  // 1%
    occasion: 3,    // 3%
    tips: 3         // 3%
};
  
function calculateFees(amount: number, collectionType: string) {
const feePercentage = PLATFORM_FEE_RATES[collectionType as keyof typeof PLATFORM_FEE_RATES] ?? 3;
const platformFee = parseFloat(((amount * feePercentage) / 100).toFixed(2));
const netAmount = parseFloat((amount - platformFee).toFixed(2));
return { feePercentage, platformFee, netAmount };
}

const initializeContribution = async (req: Request, res: Response) => {
    try {
      let supporterId = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        try {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, process.env.JWT_KEY);
          supporterId = decoded.userId;
        } catch (err) {
          // Token invalid or expired, proceed as guest
        }
      }
  
      const {
        collectionId,
        amount,
        message,
        isAnonymous = false,
        supporterName,
        supporterEmail,
        currency = 'NGN'
      } = req.body;
  
      const collection = await Collection.findById(collectionId).exec();
      if (!collection) {
        return res.status(404).json({ message: 'Collection not found' });
      }
  
      const grossAmount = parseFloat(amount);
      if (isNaN(grossAmount) || grossAmount <= 0) {
        return res.status(400).json({ message: 'amount must be a positive number.' });
      }
  
      // Call Paystack initialization from backend
      const paystackData = {
        email: supporterEmail,
        amount: Math.round(grossAmount * 100), // convert to kobo
        metadata: {
          collectionId,
          supporterName,
          isAnonymous,
          message
        }
      };
  
      const paystackInit = await initializePaystackTransaction(paystackData);
  
      const { feePercentage, platformFee, netAmount } = calculateFees(grossAmount, collection.type);
  
      const contribution = new Contribution({
        collection: collection._id,
        collectionTitle: collection.title,
        collectionType: collection.type,
        collectionCreator: collection.creator,
        supporter: isAnonymous ? null : supporterId,
        supporterName,
        supporterEmail,
        isAnonymous,
        message,
        amount: grossAmount,
        feePercentage,
        platformFee,
        netAmount,
        currency,
        paystackReference: paystackInit.data.reference
      });
  
      await contribution.save();
      res.status(201).json({
        message: 'Contribution initialized',
        data: contribution,
        access_code: paystackInit.data.access_code // For frontend Popup
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
}

const confirmContribution = async (req: Request, res: Response) => {
    try {
      const contributionRecord = await Contribution.findById(req.params.contributionId);
      if (!contributionRecord) {
        return res.status(404).json({ message: 'Contribution record not found' });
      }
  
      if (contributionRecord.status === 'completed') {
        return res.status(200).json({ message: 'Contribution already confirmed', data: contributionRecord });
      }
  
      const paystackResponse = await verifyPaystackTransaction(contributionRecord.paystackReference);
  
      if (!paystackResponse.status || paystackResponse.data.status !== 'success') {
        return res.status(400).json({ 
          message: 'Payment verification failed', 
          details: paystackResponse.message || 'Transaction not successful' 
        });
      }
  
      const expectedAmountKobo = contributionRecord.amount * 100;
      if (paystackResponse.data.amount !== expectedAmountKobo) {
        return res.status(400).json({ message: 'Payment amount mismatch' });
      }
  
      const contribution = await Contribution.confirmAndUpdateCounters(req.params.contributionId);
      
      res.status(200).json({
        message: 'Contribution confirmed',
        data: contribution
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
}

const getCollectionContributions = async (req: Request, res: Response) => {
    try {
      const contributions = await Contribution.find({
        collection: req.params.collectionId,
        status: 'completed'
      })
        .select('supporterName amount message createdAt isAnonymous')
        .sort({ createdAt: -1 })
        .exec();
  
      res.status(200).json({
        count: contributions.length,
        data: contributions
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
}

const getPlatformRevenueSummary = async (req: Request, res: Response) => {
    try {
      const [overall] = await Contribution.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: null,
            totalPlatformRevenue: { $sum: '$platformFee' },
            totalGrossDonated:    { $sum: '$amount' },
            totalNetToCreators:   { $sum: '$netAmount' },
            totalContributions:   { $sum: 1 }
          }
        },
        { $project: { _id: 0 } }
      ]);
  
      const byType = await Contribution.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$collectionType',
            platformRevenue:  { $sum: '$platformFee' },
            grossDonated:     { $sum: '$amount' },
            netToCreators:    { $sum: '$netAmount' },
            contributions:    { $sum: 1 },
            feePercentage:    { $first: '$feePercentage' }
          }
        },
        { $project: { _id: 0, type: '$_id', platformRevenue: 1, grossDonated: 1, netToCreators: 1, contributions: 1, feePercentage: 1 } }
      ]);
  
      res.status(200).json({
        summary: overall || {
          totalPlatformRevenue: 0,
          totalGrossDonated: 0,
          totalNetToCreators: 0,
          totalContributions: 0
        },
        byType
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
}

const getAllContributions = async (req: Request, res: Response) => {
    try {
      const contributions = await Contribution.find({ status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(100)
        .exec();
      res.status(200).json(contributions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  module.exports = { initializeContribution, confirmContribution, getCollectionContributions, getPlatformRevenueSummary, getAllContributions };