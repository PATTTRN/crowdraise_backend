import type { Request, Response } from 'express'
const Contribution = require('../models/contribution');
const Withdrawal = require('../models/withdrawal');
const User = require('../models/withdrawals');
import mongoose = require('mongoose');
import type { AuthenticatedRequest } from './types';
const {
    listBanks,
    resolveAccountNumber,
    createTransferRecipient,
    initiateTransfer,
} = require('../middleware/paystack');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Calculate a creator's withdrawable balance (earnings minus locked withdrawals)
async function getCreatorBalanceHelper(userId: string) {
    const creatorId = new mongoose.Types.ObjectId(userId);

    const [earningsResult] = await Contribution.aggregate([
        { $match: { collectionCreator: creatorId, status: 'completed' } },
        {
            $group: {
                _id: null,
                totalGross: { $sum: '$amount' },
                totalFees: { $sum: '$platformFee' },
                totalEarned: { $sum: '$netAmount' }
            }
        },
    ]);

    const totalGross = parseFloat((earningsResult?.totalGross ?? 0).toFixed(2));
    const totalFees = parseFloat((earningsResult?.totalFees ?? 0).toFixed(2));
    const totalEarned = parseFloat((earningsResult?.totalEarned ?? 0).toFixed(2));

    // Lock all non-rejected withdrawals so the creator can't double-request
    const [withdrawnResult] = await Withdrawal.aggregate([
        {
            $match: {
                creator: creatorId,
                status: { $in: ['pending', 'approved', 'processing', 'completed'] },
            },
        },
        { $group: { _id: null, totalLocked: { $sum: '$amount' } } },
    ]);
    const totalLocked = parseFloat((withdrawnResult?.totalLocked ?? 0).toFixed(2));

    const [paidResult] = await Withdrawal.aggregate([
        { $match: { creator: creatorId, status: 'completed' } },
        { $group: { _id: null, totalPaid: { $sum: '$amount' } } },
    ]);
    const totalPaid = parseFloat((paidResult?.totalPaid ?? 0).toFixed(2));

    const pendingAmount = parseFloat((totalLocked - totalPaid).toFixed(2));
    const available = parseFloat(Math.max(0, totalEarned - totalLocked).toFixed(2));

    return { totalGross, totalFees, totalEarned, totalPaid, pendingAmount, available };
}

const getBanks = async (req: Request, res: Response) => {
    try {
        const result = await listBanks();
        res.json({ data: result.data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

const verifyAccount = async (req: Request, res: Response) => {
    try {
        const { accountNumber, bankCode } = req.body;
        if (!accountNumber || !bankCode) {
            return res.status(400).json({ message: 'accountNumber and bankCode are required' });
        }
        const result = await resolveAccountNumber(accountNumber, bankCode);
        res.json({ accountName: result.data.account_name });
    } catch (err) {
        res.status(400).json({ error: 'Could not verify account. Check the number and bank.' });
    }
}

const saveBankDetails = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { accountNumber, bankCode, accountName, bankName } = req.body;
        if (!accountNumber || !bankCode || !accountName) {
            return res.status(400).json({ message: 'accountNumber, bankCode, and accountName are required' });
        }
        await User.findByIdAndUpdate(req.user?.userId, {
            bankDetails: { accountNumber, bankCode, accountName, bankName }
        });
        res.json({ message: 'Bank details saved successfully' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

const getCreatorBalance = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const balance = await getCreatorBalanceHelper(req.user.userId);
        res.json(balance);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

const submitWithdrawalRequest = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { amount } = req.body;
        const requestedAmount = parseFloat(amount);

        if (isNaN(requestedAmount) || requestedAmount < 1000) {
            return res.status(400).json({ message: 'Minimum withdrawal amount is ₦1,000' });
        }

        if (!req.user || !req.user.userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Must have bank details saved
        const user = await User.findById(req.user.userId);
        if (!user.bankDetails?.accountNumber) {
            return res.status(400).json({ message: 'Please save your bank details before requesting a withdrawal.' });
        }

        // Check available balance
        const { available } = await getCreatorBalanceHelper(req.user.userId);
        if (requestedAmount > available) {
            return res.status(400).json({
                message: `Insufficient balance. You have ₦${available.toLocaleString()} available.`
            });
        }

        const withdrawal = new Withdrawal({
            creator: req.user.userId,
            amount: requestedAmount,
            bankDetails: user.bankDetails
        });

        await withdrawal.save();

        res.status(201).json({
            message: 'Withdrawal request submitted. It will be processed within 1-3 business days.',
            data: withdrawal
        });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
}

const getCreatorWithdrawalHistory = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const withdrawals = await Withdrawal.find({ creator: req.user.userId })
            .sort({ createdAt: -1 })
            .exec();
        res.json({ count: withdrawals.length, data: withdrawals });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

const getAllWithdrawals = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};
        const withdrawals = await Withdrawal.find(filter)
            .populate('creator', 'name email')
            .populate('processedBy', 'name email')
            .sort({ createdAt: -1 })
            .exec();
        res.json({ count: withdrawals.length, data: withdrawals });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

const approveWithdrawal = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id);
        if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ message: `Cannot approve a withdrawal with status: ${withdrawal.status}` });
        }

        const { accountName, accountNumber, bankCode } = withdrawal.bankDetails;

        // 1. Create a Paystack transfer recipient
        const recipient = await createTransferRecipient(accountName, accountNumber, bankCode);
        const recipientCode = recipient.data.recipient_code;

        // 2. Generate a unique idempotency reference
        const reference = `CRW-WD-${withdrawal._id}-${Date.now()}`;

        // 3. Initiate the transfer
        const transfer = await initiateTransfer(
            withdrawal.amount,
            recipientCode,
            `CrowdRaise withdrawal for ${accountName}`,
            reference
        );

        if (!req.user || !req.user.userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        withdrawal.status = 'processing';
        withdrawal.paystackRecipientCode = recipientCode;
        withdrawal.paystackTransferCode = transfer.data.transfer_code;
        withdrawal.paystackTransferReference = reference;
        withdrawal.processedBy = req.user.userId;
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        res.json({
            message: 'Transfer initiated successfully. Paystack will complete it shortly.',
            data: withdrawal
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

const rejectWithdrawal = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { reason } = req.body;
        const withdrawal = await Withdrawal.findById(req.params.id);
        if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });

        if (!['pending', 'approved'].includes(withdrawal.status)) {
            return res.status(400).json({ message: `Cannot reject a withdrawal with status: ${withdrawal.status}` });
        }

        if (!req.user || !req.user.userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        withdrawal.status = 'rejected';
        withdrawal.adminNote = reason || 'No reason provided';
        withdrawal.processedBy = req.user.userId;
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        res.json({ message: 'Withdrawal rejected', data: withdrawal });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

const markWithdrawalComplete = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ message: 'Authentication required' });

        }
        const withdrawal = await Withdrawal.findByIdAndUpdate(
            req.params.id,
            { status: 'completed', processedBy: req.user.userId, processedAt: new Date() },
            { new: true }
        );
        if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });
        res.json({ message: 'Withdrawal marked as completed', data: withdrawal });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { getBanks, verifyAccount, saveBankDetails, getCreatorBalance, submitWithdrawalRequest, getCreatorWithdrawalHistory, getAllWithdrawals, approveWithdrawal, rejectWithdrawal, markWithdrawalComplete }