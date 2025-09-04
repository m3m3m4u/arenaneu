import mongoose, { Schema, Document } from 'mongoose';

export interface IShopProductFile {
  key: string;           // S3 Key
  name: string;          // Anzeigename
  size: number;          // Bytes
  contentType?: string;  // MIME
  pages?: number;        // Für PDF (optional Vorabscan)
  previewImages?: string[]; // Generierte Seiten-Thumbnails URLs
  createdAt?: Date;      // Zeitstempel des Uploads
}

export interface IShopProduct extends Document {
  title: string;
  description?: string;
  tags: string[];
  category?: string;
  files: IShopProductFile[];
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<IShopProductFile>({
  key: { type: String, required: true },
  name: { type: String, required: true },
  size: { type: Number, required: true },
  contentType: { type: String },
  pages: { type: Number },
  previewImages: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const ShopProductSchema = new Schema<IShopProduct>({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  tags: [{ type: String, trim: true }],
  category: { type: String, index: true },
  files: { type: [FileSchema], default: [] },
  isPublished: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ShopProductSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });
ShopProductSchema.pre('findOneAndUpdate', function(next){ this.set({ updatedAt: new Date() }); next(); });

try {
  if (mongoose.modelNames().includes('ShopProduct')) {
    mongoose.deleteModel('ShopProduct');
  }
} catch {}

export default mongoose.model<IShopProduct>('ShopProduct', ShopProductSchema);
