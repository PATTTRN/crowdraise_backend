import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate } from '../middleware/validate';
import * as auth from '../controllers/auth';

const router = Router();

router.get('/users', authenticate, requireAdmin, auth.getAllUsers);
router.get('/user/:userId', authenticate, auth.getUserDetails);
router.patch('/user/:userId/role', authenticate, requireAdmin, auth.updateRole);
router.delete('/user/:userId', authenticate, requireAdmin, auth.deleteUser);
router.post('/register', validate('register'), auth.registerUser);
router.post('/login', validate('login'), auth.loginUser);
router.post('/email/send-otp', authenticate, auth.sendEmailOtp);
router.post('/email/verify-otp', authenticate, auth.verifyEmailOtp);
router.post('/forgot-password', validate('forgotPassword'), auth.forgotPassword);
router.post('/reset-password', validate('resetPassword'), auth.resetPassword);
router.post('/refresh-token', authenticate, auth.refreshToken);

export default router;
