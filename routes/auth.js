var express = require('express');
const bcrypt = require('bcrypt');
var router = express.Router();
var jwt = require('jsonwebtoken');

var authenticate   = require('../middleware/authenticate');
var requireAdmin   = require('../middleware/requireAdmin');
var generateOtp    = require('../middleware/generateOtp');
var sendEmailOtp   = require('../middleware/sendEmailOtp');

const User = require('../models/user');



// GET all users - restricted to admins only
router.get('/users', authenticate, requireAdmin, (req, res, next) => {
  User.find().select('-password')
  .exec()
  .then(users => {
    res.status(200).json({
      message: 'Users fetched',
      count: users.length,
      data: users
    })
  })
  .catch(err => {
    res.status(500).json({error: err})
  })
})

// GET user details - user can see self OR admin can see any
router.get('/user/:userId', authenticate, async (req, res, next) => {
  const id = req.params.userId;

  // Allow if requesting own info, or if admin
  if (req.user.userId !== id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden. You can only access your own details.' });
  }

  try {
    const user = await User.findById(id).select('-password -emailOtp').exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update user role - Admin only
router.patch('/user/:userId/role', authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User role updated', data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE user - Admin only
router.delete('/user/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create user
router.post('/register', async (req, res, next) => {
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
        role: user.role
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST user login
router.post('/login', async (req, res, next) => {
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
        role: user.role
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send email verification OTP
router.post('/email/send-otp', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    // Rate-limit: one OTP per 60 seconds
    if (user.emailOtp?.expiresAt) {
      const secondsOld = (Date.now() - (user.emailOtp.expiresAt - 10 * 60 * 1000)) / 1000;
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
    } catch (providerError) {
      console.error('[email/send-otp] Email provider error:', providerError.message);
      if (process.env.NODE_ENV !== 'production') {
        return res.status(200).json({
          message: 'OTP generated. Email provider unavailable, using dev fallback.',
          devOtp: otp
        });
      }
      throw providerError;
    }

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST verify email OTP
router.post('/email/verify-otp', authenticate, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: 'otp is required.' });
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

    res.status(200).json({ message: 'Email verified successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST user logout (handled on frontend by deleting token)

module.exports = router;
