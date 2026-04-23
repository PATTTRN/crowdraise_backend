const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    isPrimary: { type: Boolean, default: false }
  },
  { _id: true }
);

const FundUsageSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const CollectionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['fundraiser', 'occasion', 'tips'],
      required: [true, 'Collection type is required']
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'Medical & Healthcare',
        'Education',
        'Emergency & Crisis',
        'Community Development',
        'Occasion Gifts',
        'Personal Tips',
        'Animal Welfare',
        'Arts & Culture',
        'Other'
      ]
    },
    description: {
      type: String,
      required: [true, 'Short description is required'],
      maxlength: [300, 'Description cannot exceed 300 characters']
    },
    fullStory: {
      type: String,
      maxlength: [5000, 'Story cannot exceed 5000 characters']
    },
    images: [ImageSchema],
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, 'Location cannot exceed 100 characters']
    },
    goal: {
      type: Number,
      min: [1000, 'Goal must be at least 1,000']
    },
    raised: { type: Number, default: 0 },
    supporters: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'active', 'completed', 'suspended'],
      default: 'active'
    },
    deadline: {
      type: Date,
      validate: {
        validator: function (v) {
          if (this.type === 'tips') return true;
          return !!v && v > Date.now();
        },
        message: 'Deadline must be in the future'
      }
    },
    rejectionReason: {
      type: String,
      maxlength: 500
    },
    featured: { type: Boolean, default: false },
    fundUsage: {
      type: [FundUsageSchema],
      validate: {
        validator: function (arr) {
          if (this.type !== 'fundraiser') return true;
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'Fundraisers must include at least one fund usage entry'
      }
    },
    eventDate: {
      type: Date,
      validate: {
        validator: function (v) {
          if (this.type !== 'occasion') return true;
          return !!v;
        },
        message: 'Occasions must have an event date'
      }
    },
    receiverName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    suggestedAmounts: {
      type: [Number],
      validate: {
        validator: (arr) => !arr || arr.every((n) => n > 0),
        message: 'All suggested amounts must be positive'
      }
    },
    allowAnonymousTips: { type: Boolean, default: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

CollectionSchema.virtual('progressPercent').get(function () {
  if (!this.goal || this.goal === 0) return null;
  return Math.min(Math.round((this.raised / this.goal) * 100), 100);
});

CollectionSchema.virtual('daysLeft').get(function () {
  if (!this.deadline) return null;
  const ms = this.deadline - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / (1000 * 60 * 60 * 24));
});

CollectionSchema.virtual('primaryImage').get(function () {
  if (!this.images || this.images.length === 0) return null;
  return this.images.find((img) => img.isPrimary) || this.images[0];
});

CollectionSchema.index({ status: 1, type: 1 });
CollectionSchema.index({ creator: 1, status: 1 });
CollectionSchema.index({ category: 1, status: 1 });
CollectionSchema.index({ featured: 1, status: 1 });
CollectionSchema.index({ raised: -1 });
CollectionSchema.index({ deadline: 1 });
CollectionSchema.index({ createdAt: -1 });
CollectionSchema.index(
  { title: 'text', description: 'text', fullStory: 'text' },
  { name: 'collection_search' }
);

CollectionSchema.pre('save', function (next) {
  if (this.goal && this.raised >= this.goal && this.status === 'active') {
    this.status = 'completed';
  }
  next();
});

module.exports = mongoose.model('Collection', CollectionSchema);
