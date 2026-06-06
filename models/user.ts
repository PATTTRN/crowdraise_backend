import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  emailVerified: boolean;
  emailOtp?: { code: string; expiresAt: Date; attempts: number };
  role: 'user' | 'admin';
  avatar?: { url: string; publicId: string };
  location?: string;
  stats: { totalRaised: number; totalCampaigns: number; totalSupporters: number };
  isActive: boolean;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  bankDetails?: { accountNumber: string; bankCode: string; accountName: string; bankName: string };
  notificationPrefs: { emailOnContribution: boolean; emailOnWithdrawal: boolean; emailOnCampaignUpdate: boolean };
  comparePassword(candidate: string): Promise<boolean>;
  changedPasswordAfter(jwtIssuedAt: number): boolean;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    password: { type: String, required: true, minlength: 8, select: false },
    emailVerified: { type: Boolean, default: false },
    emailOtp: { code: String, expiresAt: Date, attempts: { type: Number, default: 0 } },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    avatar: { url: String, publicId: String },
    location: { type: String, trim: true, maxlength: 100 },
    stats: { totalRaised: { type: Number, default: 0 }, totalCampaigns: { type: Number, default: 0 }, totalSupporters: { type: Number, default: 0 } },
    isActive: { type: Boolean, default: true },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    bankDetails: { accountNumber: String, bankCode: String, accountName: String, bankName: String },
    notificationPrefs: { emailOnContribution: { type: Boolean, default: true }, emailOnWithdrawal: { type: Boolean, default: true }, emailOnCampaignUpdate: { type: Boolean, default: true } },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date(Date.now() - 1000);
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.changedPasswordAfter = function (jwtIssuedAt: number): boolean {
  if (this.passwordChangedAt) {
    return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIssuedAt;
  }
  return false;
};

export default mongoose.model<IUser>('User', UserSchema);
