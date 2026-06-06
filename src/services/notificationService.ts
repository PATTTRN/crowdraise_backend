import { Notification } from '../../models';

export async function createNotification(userId: string, type: string, title: string, message?: string, metadata?: Record<string, unknown>) {
  return Notification.create({ user: userId, type, title, message, metadata });
}

export async function getNotifications(userId: string, limit = 50) {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: userId, read: false }),
  ]);
  return { notifications, unreadCount };
}

export async function markAsRead(userId: string, ids: string[]) {
  await Notification.updateMany({ user: userId, _id: { $in: ids } }, { $set: { read: true } });
}
