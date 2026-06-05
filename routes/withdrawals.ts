const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const { getBanks, verifyAccount, saveBankDetails, getCreatorBalance, submitWithdrawalRequest, getCreatorWithdrawalHistory, getAllWithdrawals, approveWithdrawal, rejectWithdrawal, markWithdrawalComplete } = require("../controllers/withdrawals")

// ─── GET /withdrawals/banks — List Nigerian banks (public) ───────────────────
router.get('/banks', getBanks);

// ─── POST /withdrawals/verify-account — Verify bank account number ───────────
router.post('/verify-account', authenticate, verifyAccount);

// ─── PUT /withdrawals/bank-details — Save bank details to creator profile ────
router.put('/bank-details', authenticate, saveBankDetails);

// ─── GET /withdrawals/balance — Get creator's withdrawable balance ────────────
router.get('/balance', authenticate, getCreatorBalance);

// ─── POST /withdrawals/request — Submit a withdrawal request ─────────────────
router.post('/request', authenticate, submitWithdrawalRequest);

// ─── GET /withdrawals/my — Creator's withdrawal history ──────────────────────
router.get('/my', authenticate, getCreatorWithdrawalHistory);

// ─── GET /withdrawals/admin/all — All withdrawals (admin only) ───────────────
router.get('/admin/all', authenticate, requireAdmin, getAllWithdrawals);

// ─── PATCH /withdrawals/:id/approve — Admin approves → triggers Paystack transfer
router.patch('/:id/approve', authenticate, requireAdmin, approveWithdrawal);

// ─── PATCH /withdrawals/:id/reject — Admin rejects with a reason ─────────────
router.patch('/:id/reject', authenticate, requireAdmin, rejectWithdrawal);

// ─── PATCH /withdrawals/:id/complete — Mark transfer as completed (webhook or manual)
router.patch('/:id/complete', authenticate, requireAdmin, markWithdrawalComplete);

module.exports = router;
