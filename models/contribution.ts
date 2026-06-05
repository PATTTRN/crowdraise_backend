const mongoose = require('mongoose');

const ContributionSchema = new mongoose.Schema(
  {
    collection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Collection',
      required: true
    },
    collectionTitle: { type: String, required: true },
    collectionType: {
      type: String,
      enum: ['fundraiser', 'occasion', 'tips'],
      required: true
    },
    collectionCreator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    supporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    supporterName: { type: String, trim: true, maxlength: 80 },
    supporterEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    isAnonymous: { type: Boolean, default: false },
    message: {
      type: String,
      trim: true,
      maxlength: [300, 'Message cannot exceed 300 characters']
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [100, 'Minimum contribution is 100']
    },
    feePercentage: {
      type: Number,
      required: true
    },
    platformFee: {
      type: Number,
      required: true,
      min: 0
    },
    netAmount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: { type: String, default: 'NGN' },
    paystackReference: {
      type: String,
      required: true,
      unique: true
    },
    paystackTransactionId: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'abandoned'],
      default: 'pending'
    },
    processed: { type: Boolean, default: false },
    paystackMeta: { type: mongoose.Schema.Types.Mixed },
    verifiedAt: Date
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true
  }
);

ContributionSchema.index({ collection: 1, status: 1 });
ContributionSchema.index({ collection: 1, createdAt: -1 });
ContributionSchema.index({ supporter: 1, status: 1 });
ContributionSchema.index({ collectionCreator: 1, status: 1 });
ContributionSchema.index({ status: 1, createdAt: -1 });

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
      {
        $inc: {
          raised: contribution.amount, // Track gross amount for public display
          supporters: 1
        }
      },
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

module.exports = mongoose.model('Contribution', ContributionSchema);
