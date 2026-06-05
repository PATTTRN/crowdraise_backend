import type { Request } from 'express';
import type {ObjectId} from "mongoose"
import type { Document } from 'mongoose';

// Extend Express Request type to include "user" for typescript
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
    email?: string;
    emailVerified?: boolean;
  };
  collection?: any;
}

export type CollectionQuery = {
  status?: unknown;
  category?: unknown;
  type?: unknown;
  creator?: unknown;
  featured?: boolean;
  $text?: { $search: string };
};

export interface IImage {
  url: string;
  publicId: string;
  isPrimary?: boolean;
}

export interface IFundUsage {
  description: string;
  amount: number;
}

export interface ICollection {
  type: 'fundraiser' | 'occasion' | 'tips';
  title: string;
  category: string;
  description: string;
  fullStory?: string;
  images: IImage[];
  creator: ObjectId;
  location?: string;
  goal?: number;
  raised?: number;
  supporters?: number;
  status?: 'draft' | 'active' | 'completed' | 'suspended';
  deadline?: Date;
  rejectionReason?: string;
  featured?: boolean;
  fundUsage?: IFundUsage[];
  eventDate?: Date;
  receiverName?: string;
  suggestedAmounts?: number[];
  allowAnonymousTips?: boolean;
  createdAt?: Date;
  updatedAt?: Date;

  // virtuals
  progressPercent?: number | null;
  daysLeft?: number | null;
  primaryImage?: IImage | null;
}

// TypeScript interface for User document instance methods
interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
  changedPasswordAfter(jwtIssuedAt: number): boolean;
}

export interface IUser extends Document, IUserMethods {
  name: string;
  email: string;
  password: string;
  emailVerified: boolean;
  emailOtp: {
    code?: string;
    expiresAt?: Date;
    attempts?: number;
  };
  role: string;
  avatar: {
    url?: string;
    publicId?: string;
  };
  location?: string;
  stats: {
    totalRaised: number;
    totalCampaigns: number;
    totalSupporters: number;
  };
  isActive: boolean;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  bankDetails: {
    accountNumber?: string;
    bankCode?: string;
    accountName?: string;
    bankName?: string;
  };
}