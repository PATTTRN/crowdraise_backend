var express = require('express');
const bcrypt = require('bcrypt');
var router = express.Router();

var authenticate = require('../middleware/authenticate');
var requireAdmin  = require('../middleware/requireAdmin');
var generateOtp   = require('../middleware/generateOtp');
var sendSmsOtp    = require('../middleware/sendSmsOtp');

const User = require('../models/user');



// GET all users - now restricted to admins only
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
    const user = await User.findById(id).select('-password -phoneOtp').exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

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
      phoneNumber: req.body.phoneNumber,
      role: req.body.role || 'user',
      location: req.body.country
    });

    const result = await user.save();
    res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: result._id,
        name: result.name,
        email: result.email,
        role: result.role,
        phoneVerified: result.phoneVerified
      }
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
        phoneVerified: user.phoneVerified
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send phone verification OTP
router.post('/phone/send-otp', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // before generating a new OTP
    if (user.phoneOtp?.expiresAt) {
      const secondsOld = (Date.now() - (user.phoneOtp.expiresAt - 10 * 60 * 1000)) / 1000;
      if (secondsOld < 60) {
        return res.status(429).json({ message: 'Please wait 60 seconds before requesting another code.' });
      }
    }

    const phoneNumber = req.body.phoneNumber || user.phoneNumber;
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phoneNumber is required.' });
    }

    const otp = generateOtp();
    user.phoneNumber = phoneNumber;
    user.phoneOtp = {
      code: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    };
    await user.save();

    try {
      await sendSmsOtp(phoneNumber, otp);
    } catch (providerError) {
      if (process.env.NODE_ENV !== 'production') {
        return res.status(200).json({
          message: 'OTP generated. SMS provider unavailable, using dev fallback.',
          devOtp: otp
        });
      }
      throw providerError;
    }

    res.status(200).json({ message: 'OTP sent successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST verify phone OTP
router.post('/phone/verify-otp', authenticate, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: 'otp is required.' });
    }

    const user = await User.findById(req.user.userId).exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.phoneOtp || !user.phoneOtp.code || !user.phoneOtp.expiresAt) {
      return res.status(400).json({ message: 'No OTP request found. Please request a new code.' });
    }

    if (user.phoneOtp.expiresAt < new Date()) {
      user.phoneOtp = undefined;
      await user.save();
      return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
    }

    if (user.phoneOtp.attempts >= 3) {
      user.phoneOtp = undefined;
      await user.save();
      return res.status(400).json({ message: 'Too many attempts. Please request a new code.' });
    }

    user.phoneOtp.attempts += 1;
    await user.save();

    const isValidOtp = await bcrypt.compare(String(otp), user.phoneOtp.code);

    if (!isValidOtp) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    user.phoneVerified = true;
    user.phoneOtp = undefined;
    await user.save();

    res.status(200).json({ message: 'Phone number verified successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST user logout (to be handled on frontend by deleting token)

module.exports = router;
