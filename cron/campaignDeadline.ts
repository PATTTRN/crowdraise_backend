import cron from 'node-cron';
import mongoose from 'mongoose';
import { Collection, User, Notification } from '../models';
import { sendCampaignCompleted } from '../src/services/emailService';

async function processExpiredCampaigns() {
  const expired = await Collection.find({ deadline: { $lt: new Date() }, status: 'active' });

  for (const collection of expired) {
    collection.status = 'completed';
    await collection.save();

    const creator = await User.findById(collection.creator);
    if (creator?.email && creator?.notificationPrefs?.emailOnCampaignUpdate !== false) {
      sendCampaignCompleted(creator.email, creator.name, collection.title, collection.raised).catch(() => {});
    }
    await Notification.create({
      user: collection.creator,
      type: 'campaign_completed',
      title: `Campaign completed: ${collection.title}`,
      message: `Reached deadline with ₦${collection.raised.toLocaleString()} raised.`,
    });
  }
  if (expired.length > 0) console.log(`[Cron] Auto-completed ${expired.length} campaigns`);
}

export function startCampaignDeadlineCron() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const db = mongoose.connection.db;
      if (!db) return;
      const lock = await (db.collection('cron_locks') as any).findOneAndUpdate(
        { _id: 'campaign_deadline', expiresAt: { $lt: new Date() } },
        { $set: { expiresAt: new Date(Date.now() + 300000) } },
        { upsert: true, returnDocument: 'after' }
      );
      if (!lock) return;
      await processExpiredCampaigns();
    } catch (err) {
      console.error('[Cron] Error:', (err as Error).message);
    }
  });
  console.log('[Cron] Campaign deadline scheduler started');
}
