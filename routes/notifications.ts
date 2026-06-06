import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import * as notifications from '../controllers/notifications';

const router = Router();

router.get('/', authenticate, notifications.getAll);
router.patch('/read', authenticate, notifications.markRead);
router.patch('/prefs', authenticate, notifications.updatePrefs);

export default router;
