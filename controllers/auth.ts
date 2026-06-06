import { Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User } from '../models';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { AppError, NotFoundError } from '../src/utils/errors';
import config from '../src/config';
import { signToken, generateOtp, hashOtp, generateResetToken, hashToken } from '../src/services/authService';
import { sendOtpEmail, sendPasswordResetEmail } from '../src/services/emailService';

export const registerUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await User.findOne({ email: req.body.email });
  if (existing) throw new AppError(409, 'DUPLICATE_EMAIL', 'User with this email already exists');

  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    role: req.body.role || 'user',
    location: req.body.country,
  });

  const otp = generateOtp();
  user.emailOtp = { code: await hashOtp(otp), expiresAt: new Date(Date.now() + config.otpExpiryMs), attempts: 0 };
  await user.save();

  sendOtpEmail(user.email, otp).catch((e) => console.warn('[Auth] Initial OTP failed:', e.message));
  const token = signToken(user);

  res.status(201).json({
    message: 'User created. Please verify your email.',
    data: { token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified } },
    devOtp: config.nodeEnv !== 'production' ? otp : undefined,
  });
});

export const loginUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findOne({ email: req.body.email }).select('+password');
  if (!user || !(await user.comparePassword(req.body.password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login details');
  }

  const token = signToken(user);
  res.status(200).json({
    message: 'Login successful',
    data: { token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified } },
  });
});

export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const users = await User.find().select('-password').lean();
  res.status(200).json({ message: 'Users fetched', count: users.length, data: users });
});

export const getUserDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user?.userId !== req.params.userId && req.user?.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'You can only access your own details');
  }
  const user = await User.findById(req.params.userId).select('-password -emailOtp');
  if (!user) throw new NotFoundError('User');
  res.status(200).json({ user });
});

export const updateRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) throw new AppError(400, 'INVALID_ROLE', 'Invalid role');
  const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true }).select('-password');
  if (!user) throw new NotFoundError('User');
  res.json({ message: 'Role updated', data: user });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByIdAndDelete(req.params.userId);
  if (!user) throw new NotFoundError('User');
  res.json({ message: 'User deleted' });
});

export const sendEmailOtp = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new NotFoundError('User');
  if (user.emailVerified) throw new AppError(400, 'ALREADY_VERIFIED', 'Email is already verified');
  if (user.emailOtp?.expiresAt && (Date.now() - (user.emailOtp.expiresAt.getTime() - config.otpExpiryMs)) / 1000 < 60) {
    throw new AppError(429, 'RATE_LIMITED', 'Wait 60 seconds before requesting another code');
  }

  const otp = generateOtp();
  user.emailOtp = { code: await hashOtp(otp), expiresAt: new Date(Date.now() + config.otpExpiryMs), attempts: 0 };
  await user.save();

  try {
    await sendOtpEmail(user.email, otp);
    res.status(200).json({ message: 'Verification code sent' });
  } catch {
    if (config.nodeEnv !== 'production') {
      res.status(200).json({ message: 'OTP generated (email unavailable)', devOtp: otp });
    } else {
      throw new AppError(500, 'EMAIL_FAILED', 'Failed to send email');
    }
  }
});

export const verifyEmailOtp = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { otp } = req.body;
  if (!otp) throw new AppError(400, 'MISSING_OTP', 'OTP is required');

  const user = await User.findById(req.user!.userId);
  if (!user) throw new NotFoundError('User');
  if (user.emailVerified) throw new AppError(400, 'ALREADY_VERIFIED', 'Email already verified');
  if (!user.emailOtp?.code || !user.emailOtp.expiresAt) throw new AppError(400, 'NO_OTP', 'No OTP request found');
  if (user.emailOtp.expiresAt < new Date()) throw new AppError(400, 'OTP_EXPIRED', 'OTP has expired');
  if (user.emailOtp.attempts >= 3) throw new AppError(400, 'TOO_MANY_ATTEMPTS', 'Too many attempts');

  user.emailOtp.attempts += 1;
  await user.save();

  if (!(await bcrypt.compare(String(otp), user.emailOtp.code))) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid OTP');
  }

  user.emailVerified = true;
  user.emailOtp = undefined;
  await user.save();

  res.status(200).json({
    message: 'Email verified',
    user: { _id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
  });
});

export const forgotPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
    return;
  }

  const resetToken = generateResetToken();
  user.passwordResetToken = await hashToken(resetToken);
  user.passwordResetExpires = new Date(Date.now() + 3600000);
  await user.save();

  const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
  sendPasswordResetEmail(email, resetUrl).catch((e) => console.warn('[Auth] Reset email failed:', e.message));

  if (config.nodeEnv !== 'production') {
    res.status(200).json({ message: 'Reset link sent', devToken: resetToken });
  } else {
    res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
  }
});

export const resetPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, token, newPassword } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
    throw new AppError(400, 'INVALID_RESET', 'Invalid or expired reset token');
  }
  if (user.passwordResetExpires < new Date()) throw new AppError(400, 'TOKEN_EXPIRED', 'Reset token has expired');
  if (!(await bcrypt.compare(token, user.passwordResetToken))) throw new AppError(400, 'INVALID_TOKEN', 'Invalid reset token');

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.status(200).json({ message: 'Password reset successful' });
});

export const refreshToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new NotFoundError('User');
  const token = signToken(user);
  res.status(200).json({ message: 'Token refreshed', data: { token } });
});
