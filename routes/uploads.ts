import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { uploadFile, getSignature } from '../controllers/uploads';
import config from '../src/config';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadMaxSize } });

router.post('/image', authenticate, upload.single('file'), uploadFile);
router.get('/signature', authenticate, getSignature);

export default router;
