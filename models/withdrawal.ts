const mongoose = require('mongoose');

// Snapshot of bank details at the time of request — immutable after creation
const BankSnapshotSchema = new mongoose.Schema(
  {
    accountNumber: { type: String, required: true, trim: true },
    bankCode: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    bankName: { type: String, trim: true }
  },
  { _id: false }
);

const WithdrawalSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1000, 'Minimum withdrawal is ₦1,000']
    },
    // Immutable snapshot of bank details used for this withdrawal
    bankDetails: {
      type: BankSnapshotSchema,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'processing', 'completed', 'rejected'],
      default: 'pending'
    },
    // Paystack identifiers — populated when admin approves
    paystackRecipientCode: { type: String },
    paystackTransferCode: { type: String },
    paystackTransferReference: { type: String },
    // Admin action metadata
    adminNote: { type: String, maxlength: 500 },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    processedAt: { type: Date }
  },
  { timestamps: true }
);

WithdrawalSchema.index({ creator: 1, status: 1 });
WithdrawalSchema.index({ creator: 1, createdAt: -1 });
WithdrawalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Withdrawal', WithdrawalSchema);
