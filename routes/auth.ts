var express = require('express');
var router = express.Router();
var authenticate   = require('../middleware/authenticate');
var requireAdmin   = require('../middleware/requireAdmin');

const { 
  getAllUsers, 
  getUserDetails, 
  updateRole, 
  deleteUser, 
  registerUser, 
  loginUser, 
  sendEmailOtp, 
  verifyEmailOtp
} = require('../controllers/auth');



// GET all users - restricted to admins only
router.get('/users', authenticate, requireAdmin, getAllUsers);

// GET user details - user can see self OR admin can see any
router.get('/user/:userId', authenticate, getUserDetails);

// PATCH update user role - Admin only
router.patch('/user/:userId/role', authenticate, requireAdmin, updateRole);

// DELETE user - Admin only
router.delete('/user/:userId', authenticate, requireAdmin, deleteUser);

// POST create user
router.post('/register', registerUser);

// POST user login
router.post('/login', loginUser);

// POST send email verification OTP
router.post('/email/send-otp', authenticate, sendEmailOtp);

// POST verify email OTP
router.post('/email/verify-otp', authenticate, verifyEmailOtp);

// User logout (handled on frontend by deleting token)

module.exports = router;
