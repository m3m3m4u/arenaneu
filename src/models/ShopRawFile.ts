import mongoose, { Schema, Document } from 'mongoose';

export interface IShopRawFile extends Document {
  key: string; // Speicher-Key (WebDAV/S3)
  name: string; // Ursprünglicher Dateiname
  size: number;
  contentType?: string;
  createdBy?: string;
  createdAt: Date;
}

const ShopRawFileSchema = new Schema<IShopRawFile>({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true, index: true },
  size: { type: Number, required: true },
  contentType: { type: String },
  createdBy: { type: String, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

try { if(mongoose.modelNames().includes('ShopRawFile')) mongoose.deleteModel('ShopRawFile'); } catch {}

export default mongoose.model<IShopRawFile>('ShopRawFile', ShopRawFileSchema);
