const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const generateOtp = require('../middleware/generateOtp');
const sendEmailOtp = require('../middleware/sendEmailOtp');
const User = require('../models/user');
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../lib/types';

const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  User.find().select('-password')
  .exec()
  .then((users: typeof User[]) => {
    res.status(200).json({
      message: 'Users fetched',
      count: users.length,
      data: users
    })
  })
  .catch((err: Error) => {
    res.status(500).json({error: err})
  })
}

const getUserDetails = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const id = req.params.userId;

  // Allow if requesting own info, or if admin
  if (
    !req.user || // Defensive
    (req.user.userId !== id && req.user.role !== 'admin')
  ) {
    return res.status(403).json({ message: 'Forbidden. You can only access your own details.' });
  }

  try {
    const user = await User.findById(id).select('-password -emailOtp').exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const updateRole = async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User role updated', data: user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const deleteUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const registerUser = async (req: Request, res: Response) => {
  try {
    const existingUser = await User.findOne({ email: req.body.email }).exec();
    if (existingUser) {
      return res.status(409).json({
        message: 'User with this email already exists'
      });
    }

    const user = new User({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: req.body.role || 'user',
      location: req.body.country
    });

    const result = await user.save();

    // Automatically send verification OTP
    const otp = generateOtp();
    user.emailOtp = {
      code: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0
    };
    await user.save();

    try {
      await sendEmailOtp(user.email, otp);
    } catch (e) {
      console.warn('Initial OTP send failed, user can request again later', e);
    }

    const token = jwt.sign(
      {
        email: user.email,
        userId: user._id,
        role: user.role,
        emailVerified: user.emailVerified
      },
      process.env.JWT_KEY,
      {
        expiresIn: '72h'
      }
    );

    res.status(201).json({
      message: 'User created successfully. Please verify your email.',
      token,
      user: {
        _id: result._id,
        name: result.name,
        email: result.email,
        role: result.role,
        emailVerified: result.emailVerified
      },
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ email: req.body.email }).select('+password').exec();
    if (!user) {
      return res.status(401).json({
        message: 'Invalid login details'
      });
    }

    const isValidPassword = await user.comparePassword(req.body.password);
    if (!isValidPassword) {
      return res.status(401).json({
        message: 'Invalid login details'
      });
    }

    const token = jwt.sign(
      {
        email: user.email,
        userId: user._id,
        role: user.role,
        emailVerified: user.emailVerified
      },
      process.env.JWT_KEY,
      {
        expiresIn: '72h'
      }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const sendEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const user = await User.findById(req.user.userId).exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    // Rate-limit: one OTP per 60 seconds
    if (user.emailOtp?.expiresAt) {
      const secondsOld = (Date.now() - (user.emailOtp.expiresAt.getTime() - 10 * 60 * 1000)) / 1000;
      if (secondsOld < 60) {
        return res.status(429).json({ message: 'Please wait 60 seconds before requesting another code.' });
      }
    }

    const otp = generateOtp();
    user.emailOtp = {
      code: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0
    };
    await user.save();

    try {
      await sendEmailOtp(user.email, otp);
    } catch (providerError: unknown) {
      let errorMsg = '[email/send-otp] Email provider error: ';
      if (
        typeof providerError === 'object' &&
        providerError !== null &&
        'message' in providerError
      ) {
        errorMsg += (providerError as any).message;
      } else {
        errorMsg += String(providerError);
      }
      console.error(errorMsg);
      if (process.env.NODE_ENV !== 'production') {
        return res.status(200).json({
          message: 'OTP generated. Email provider unavailable, using dev fallback.',
          devOtp: otp
        });
      }
      throw providerError;
    }

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const verifyEmailOtp = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: 'otp is required.' });
    }

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await User.findById(req.user.userId).exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    if (!user.emailOtp?.code || !user.emailOtp?.expiresAt) {
      return res.status(400).json({ message: 'No OTP request found. Please request a new code.' });
    }

    if (user.emailOtp.expiresAt < new Date()) {
      user.emailOtp = undefined;
      await user.save();
      return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
    }

    if (user.emailOtp.attempts >= 3) {
      user.emailOtp = undefined;
      await user.save();
      return res.status(400).json({ message: 'Too many attempts. Please request a new code.' });
    }

    user.emailOtp.attempts += 1;
    await user.save();

    const isValidOtp = await bcrypt.compare(String(otp), user.emailOtp.code);
    if (!isValidOtp) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    user.emailVerified = true;
    user.emailOtp = undefined;
    await user.save();

    res.status(200).json({
      message: 'Email verified successfully.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllUsers,
  getUserDetails,
  updateRole,
  deleteUser,
  registerUser,
  loginUser,
  sendEmailOtp: sendEmail,
  verifyEmailOtp
};
