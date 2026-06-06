import mongoose, { Schema, Document } from 'mongoose';

export interface IImage { url: string; publicId: string; isPrimary?: boolean }
export interface IUpdate { message: string; createdAt: Date }
export interface IFundUsage { description: string; amount: number }

export interface ICollection extends Document {
  type: 'fundraiser' | 'occasion' | 'tips';
  title: string;
  category: string;
  description: string;
  fullStory?: string;
  images: IImage[];
  creator: mongoose.Types.ObjectId;
  location?: string;
  goal?: number;
  raised: number;
  supporters: number;
  status: 'draft' | 'pending' | 'active' | 'completed' | 'suspended' | 'rejected';
  deadline?: Date;
  rejectionReason?: string;
  featured: boolean;
  fundUsage?: IFundUsage[];
  eventDate?: Date;
  receiverName?: string;
  suggestedAmounts?: number[];
  allowAnonymousTips: boolean;
  updates: IUpdate[];
  progressPercent: number | null;
  daysLeft: number | null;
  primaryImage: IImage | null;
}

const ImageSchema = new Schema<IImage>({ url: { type: String, required: true }, publicId: { type: String, required: true }, isPrimary: { type: Boolean, default: false } }, { _id: true });

const CollectionSchema = new Schema<ICollection>(
  {
    type: { type: String, enum: ['fundraiser', 'occasion', 'tips'], required: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: ['Medical & Healthcare', 'Education', 'Emergency & Crisis', 'Community Development', 'Occasion Gifts', 'Personal Tips', 'Animal Welfare', 'Arts & Culture', 'Other'] },
    description: { type: String, required: true, maxlength: 300 },
    fullStory: { type: String, maxlength: 5000 },
    images: [ImageSchema],
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    location: { type: String, trim: true, maxlength: 100 },
    goal: { type: Number, min: 1000 },
    raised: { type: Number, default: 0 },
    supporters: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'pending', 'active', 'completed', 'suspended', 'rejected'], default: 'active' },
    deadline: { type: Date, validate: { validator: function (this: ICollection, v: Date) { return this.type === 'tips' || (!!v && v > new Date()); }, message: 'Deadline must be in the future' } },
    rejectionReason: { type: String, maxlength: 500 },
    featured: { type: Boolean, default: false },
    fundUsage: { type: [{ description: String, amount: { type: Number, min: 0 } }], validate: { validator: function (this: ICollection, arr: IFundUsage[]) { return this.type !== 'fundraiser' || (Array.isArray(arr) && arr.length > 0); }, message: 'Fundraisers need fund usage entries' } },
    eventDate: { type: Date, validate: { validator: function (this: ICollection, v: Date) { return this.type !== 'occasion' || !!v; }, message: 'Occasions need an event date' } },
    receiverName: { type: String, trim: true, maxlength: 100 },
    suggestedAmounts: { type: [Number], validate: { validator: (arr: number[]) => !arr || arr.every((n) => n > 0), message: 'Amounts must be positive' } },
    allowAnonymousTips: { type: Boolean, default: true },
    updates: [{ message: String, createdAt: { type: Date, default: Date.now } }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

CollectionSchema.virtual('progressPercent').get(function () {
  if (!this.goal || this.goal === 0) return null;
  return Math.min(Math.round((this.raised / this.goal) * 100), 100);
});

CollectionSchema.virtual('daysLeft').get(function () {
  if (!this.deadline) return null;
  const ms = this.deadline.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / (1000 * 60 * 60 * 24));
});

CollectionSchema.virtual('primaryImage').get(function () {
  if (!this.images || this.images.length === 0) return null;
  return this.images.find((img) => img.isPrimary) || this.images[0];
});

CollectionSchema.index({ status: 1, type: 1 });
CollectionSchema.index({ creator: 1, status: 1 });
CollectionSchema.index({ featured: 1, status: 1 });
CollectionSchema.index({ raised: -1 });
CollectionSchema.index({ createdAt: -1 });
CollectionSchema.index({ title: 'text', description: 'text', fullStory: 'text' }, { name: 'collection_search' });

CollectionSchema.pre('save', function () {
  if (this.goal && this.raised >= this.goal && this.status === 'active') {
    this.status = 'completed';
  }
});

export default mongoose.model<ICollection>('Collection', CollectionSchema);
