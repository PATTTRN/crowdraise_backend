import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IContribution {
  collection: mongoose.Types.ObjectId;

  collectionTitle: string;
  collectionType: 'fundraiser' | 'occasion' | 'tips';
  collectionCreator: mongoose.Types.ObjectId;
  supporter?: mongoose.Types.ObjectId;
  supporterName?: string;
  supporterEmail?: string;
  isAnonymous: boolean;
  message?: string;
  amount: number;
  feePercentage: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  paystackReference: string;
  paystackTransactionId?: string;
  status: 'pending' | 'completed' | 'failed' | 'abandoned' | 'refunded';
  processed: boolean;
  paystackMeta?: Record<string, unknown>;
  verifiedAt?: Date;
  refundedAt?: Date;
  refundReference?: string;
}

interface IContributionModel extends Model<IContribution> {
  confirmAndUpdateCounters(contributionId: string): Promise<IContribution | null>;
}

const ContributionSchema = new Schema<IContribution>(
  {
    collection: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    collectionTitle: { type: String, required: true },
    collectionType: { type: String, enum: ['fundraiser', 'occasion', 'tips'], required: true },
    collectionCreator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    supporter: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    supporterName: { type: String, trim: true, maxlength: 80 },
    supporterEmail: { type: String, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    isAnonymous: { type: Boolean, default: false },
    message: { type: String, trim: true, maxlength: 300 },
    amount: { type: Number, required: true, min: 100 },
    feePercentage: { type: Number, required: true },
    platformFee: { type: Number, required: true, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NGN' },
    paystackReference: { type: String, required: true, unique: true },
    paystackTransactionId: String,
    status: { type: String, enum: ['pending', 'completed', 'failed', 'abandoned', 'refunded'], default: 'pending' },
    processed: { type: Boolean, default: false },
    paystackMeta: { type: Schema.Types.Mixed },
    verifiedAt: Date,
    refundedAt: Date,
    refundReference: String,
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

ContributionSchema.index({ collection: 1, status: 1 });
ContributionSchema.index({ collectionCreator: 1, status: 1 });
ContributionSchema.index({ paystackReference: 1 }, { unique: true });

ContributionSchema.statics.confirmAndUpdateCounters = async function (contributionId: string) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const contribution = await this.findOneAndUpdate(
      { _id: contributionId, processed: false },
      { $set: { status: 'completed', processed: true, verifiedAt: new Date() } },
      { new: true, session }
    );
    if (!contribution) {
      await session.abortTransaction();
      return null;
    }
    const Collection = mongoose.model('Collection');
    await Collection.findByIdAndUpdate(
      contribution.collection,
      { $inc: { raised: contribution.amount, supporters: 1 } },
      { session }
    );
    await session.commitTransaction();
    return contribution;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export default mongoose.model<IContribution, IContributionModel>('Contribution', ContributionSchema);
