var express = require('express');
var jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
var router = express.Router();

const User = require('../models/user');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authentication token.' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token.' });
    req.user = decoded;
    next();
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendSmsOtp(phoneNumber, otp) {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();
  const message = `Your Crowdraise verification code is ${otp}. It expires in 10 minutes.`;

  if (provider === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
    }

    const body = new URLSearchParams({
      To: phoneNumber,
      From: from,
      Body: message
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Twilio SMS failed: ${err}`);
    }
    return;
  }

  if (provider === 'termii') {
    const apiKey = process.env.TERMII_API_KEY;
    const from = process.env.TERMII_SENDER_ID || 'N-Alert';
    if (!apiKey) {
      throw new Error('Termii is not configured. Set TERMII_API_KEY.');
    }

    const response = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phoneNumber,
        from,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: apiKey
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Termii SMS failed: ${err}`);
    }
    return;
  }

  throw new Error('SMS_PROVIDER must be set to "twilio" or "termii".');
}

// GET all users
router.get('/users', (req, res, next) => {
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

// GET user details
router.get('/user/:userId', (req, res, next) => {
  const id = req.params.userId;
  User.findById(id)
  .exec()
  .then(user => {
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      })
    }
    res.status(200).json({
      user
    })
  })
  .catch(err => {
    res.status(500).json({ error: err.message });
  })
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
