import { Response } from 'express';
import { User } from '../models';
import { AuthRequest } from '../middleware/authenticate';
import { asyncHandler } from '../src/utils/asyncHandler';
import { getNotifications, markAsRead } from '../src/services/notificationService';

export const getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await getNotifications(req.user!.userId);
  res.status(200).json({ message: 'Notifications fetched', data: result.notifications, unreadCount: result.unreadCount });
});

export const markRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  await markAsRead(req.user!.userId, req.body.ids || []);
  res.status(200).json({ message: 'Notifications marked as read' });
});

export const updatePrefs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByIdAndUpdate(req.user!.userId, { $set: { notificationPrefs: req.body } }, { new: true }).select('notificationPrefs');
  res.status(200).json({ message: 'Preferences updated', data: user?.notificationPrefs });
});
