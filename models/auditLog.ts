import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  admin: mongoose.Types.ObjectId;
  action: string;
  target: string;
  targetId: mongoose.Types.ObjectId;
  details: Record<string, unknown>;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    target: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

AuditLogSchema.index({ admin: 1, createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
