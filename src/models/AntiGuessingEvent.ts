import mongoose, { Schema, Document } from 'mongoose';

export interface IAntiGuessingEvent extends Document {
  user: mongoose.Types.ObjectId;
  class: mongoose.Types.ObjectId;
  teacher: mongoose.Types.ObjectId;
  createdAt: Date;
}

const AntiGuessingEventSchema = new Schema<IAntiGuessingEvent>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  class: { type: Schema.Types.ObjectId, ref: 'TeacherClass', required: true, index: true },
  teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Optional: TTL Index um alte Events zu purgen (z.B. nach 30 Tagen)
try {
  AntiGuessingEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
} catch {}

try {
  if (mongoose.modelNames().includes('AntiGuessingEvent')) {
    mongoose.deleteModel('AntiGuessingEvent');
  }
} catch {}

export default mongoose.model<IAntiGuessingEvent>('AntiGuessingEvent', AntiGuessingEventSchema);
