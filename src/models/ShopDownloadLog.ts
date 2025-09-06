import mongoose, { Schema, Document } from 'mongoose';

export interface IShopDownloadLog extends Document {
  productId: string;
  user?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const ShopDownloadLogSchema = new Schema<IShopDownloadLog>({
  productId: { type: String, required: true, index: true },
  user: { type: String },
  role: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now, index: true }
});

try {
  if (mongoose.modelNames().includes('ShopDownloadLog')) {
    mongoose.deleteModel('ShopDownloadLog');
  }
} catch {}

export default mongoose.model<IShopDownloadLog>('ShopDownloadLog', ShopDownloadLogSchema);
