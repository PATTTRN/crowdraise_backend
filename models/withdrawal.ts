import mongoose, { Schema, Document } from 'mongoose';

export interface IBankSnapshot {
  accountNumber: string;
  bankCode: string;
  accountName: string;
  bankName?: string;
}

export interface IWithdrawal extends Document {
  creator: mongoose.Types.ObjectId;
  amount: number;
  bankDetails: IBankSnapshot;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';
  paystackRecipientCode?: string;
  paystackTransferCode?: string;
  paystackTransferReference?: string;
  adminNote?: string;
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
}

const WithdrawalSchema = new Schema<IWithdrawal>(
  {
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 1000 },
    bankDetails: { accountNumber: { type: String, required: true }, bankCode: { type: String, required: true }, accountName: { type: String, required: true }, bankName: String },
    status: { type: String, enum: ['pending', 'approved', 'processing', 'completed', 'rejected'], default: 'pending' },
    paystackRecipientCode: String,
    paystackTransferCode: String,
    paystackTransferReference: String,
    adminNote: { type: String, maxlength: 500 },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date,
  },
  { timestamps: true }
);

WithdrawalSchema.index({ creator: 1, status: 1 });
WithdrawalSchema.index({ creator: 1, createdAt: -1 });

export default mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema);
