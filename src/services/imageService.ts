import crypto from 'crypto';
import config from '../config';
import { httpsRequest } from '../utils/httpClient';
import { AppError } from '../utils/errors';

interface UploadResult {
  url: string;
  fileId: string;
  thumbnailUrl?: string;
}

export async function uploadImage(fileBuffer: Buffer, fileName: string): Promise<UploadResult> {
  if (!config.imagekit.privateKey) {
    if (config.nodeEnv !== 'production') {
      console.warn('[ImageUpload] No IMAGEKIT_PRIVATE_KEY. Using placeholder.');
      return { url: `https://via.placeholder.com/600x400?text=${encodeURIComponent(fileName)}`, fileId: 'dev-placeholder' };
    }
    throw new AppError(500, 'IMAGEKIT_CONFIG', 'ImageKit not configured');
  }

  const boundary = crypto.randomBytes(16).toString('hex');
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\n${Date.now()}-${fileName}`),
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="useUniqueFileName"\r\n\r\ntrue`),
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n/crowdraise`),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return httpsRequest<{ url: string; fileId: string; thumbnailUrl?: string }>(
    {
      hostname: 'upload.imagekit.io',
      path: '/api/v1/files/upload',
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(config.imagekit.privateKey + ':').toString('base64')}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length.toString(),
      },
    },
    payload.toString()
  );
}

export function generateUploadSignature() {
  if (!config.imagekit.privateKey) {
    throw new AppError(500, 'IMAGEKIT_CONFIG', 'ImageKit not configured');
  }
  const expire = Math.floor(Date.now() / 1000) + 1800;
  const token = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha1', config.imagekit.privateKey).update(`${token}${expire}`).digest('hex');
  return { token, expire, signature, publicKey: config.imagekit.publicKey, urlEndpoint: config.imagekit.urlEndpoint };
}
