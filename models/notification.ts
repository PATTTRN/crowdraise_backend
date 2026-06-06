import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message?: string;
  read: boolean;
  metadata?: Record<string, unknown>;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: String,
    read: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
