import mongoose, { Schema, Document } from 'mongoose';

export interface IPrimaryCamera extends Document {
  deviceId: string;
  updatedAt: Date;
}

const primaryCameraSchema = new Schema<IPrimaryCamera>({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export const PrimaryCamera = mongoose.model<IPrimaryCamera>('PrimaryCamera', primaryCameraSchema);
