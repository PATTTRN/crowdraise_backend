import { Response } from 'express';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { uploadImage, generateUploadSignature } from '../src/services/imageService';
import { AppError } from '../src/utils/errors';

export const uploadFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'No file provided');
  const result = await uploadImage(req.file.buffer, req.file.originalname);
  res.status(200).json({ message: 'Image uploaded', data: { url: result.url, fileId: result.fileId } });
});

export const getSignature = asyncHandler(async (req: AuthRequest, res: Response) => {
  const params = generateUploadSignature();
  res.status(200).json({ message: 'Upload signature generated', data: params });
});
