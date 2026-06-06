const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
import type {IUser} from '../lib/types'

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailOtp: {
      code: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 }
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    avatar: {
      url: String,
      publicId: String
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, 'Location cannot exceed 100 characters']
    },
    stats: {
      totalRaised: { type: Number, default: 0 },
      totalCampaigns: { type: Number, default: 0 },
      totalSupporters: { type: Number, default: 0 }
    },
    isActive: { type: Boolean, default: true },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    // Saved bank account for withdrawals — populated when creator adds bank details
    bankDetails: {
      accountNumber: { type: String, trim: true },
      bankCode: { type: String, trim: true },
      accountName: { type: String, trim: true },
      bankName: { type: String, trim: true }
    }
  },
  {
    timestamps: true
  }
);

UserSchema.pre('save', async function (this: IUser) {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date(Date.now() - 1000);
});

UserSchema.methods.comparePassword = async function (
  this: IUser,
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.changedPasswordAfter = function (
  this: IUser,
  jwtIssuedAt: number
): boolean {
  if (this.passwordChangedAt) {
    // passwordChangedAt is a Date, getTime() returns ms since epoch.
    return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIssuedAt;
  }
  return false;
};

module.exports = mongoose.model('User', UserSchema);
