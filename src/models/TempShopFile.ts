import mongoose, { Schema } from 'mongoose';

export interface ITempShopFile extends mongoose.Document {
  key: string;
  name: string;
  size: number;
  contentType?: string;
  createdBy?: string;
  createdAt: Date;
}

const TempShopFileSchema = new Schema<ITempShopFile>({
  key: { type: String, required: true, index: true },
  name: { type: String, required: true },
  size: { type: Number, required: true },
  contentType: { type: String },
  createdBy: { type: String },
  // TTL korrekt über expires (nicht verschachtelt unter index), löscht nach 24h automatisch
  createdAt: { type: Date, default: Date.now, expires: '24h' },
});

export default (mongoose.models.TempShopFile as mongoose.Model<ITempShopFile>) || mongoose.model<ITempShopFile>('TempShopFile', TempShopFileSchema);
