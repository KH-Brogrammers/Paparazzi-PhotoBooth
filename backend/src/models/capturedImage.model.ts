import mongoose, { Schema, Document } from 'mongoose';

export interface ICapturedImage extends Document {
  imageId: string;
  cameraId: string;
  cameraLabel: string;
  s3Url?: string;
  s3Key?: string;
  localUrl?: string;
  storageType: 's3' | 'local';
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CapturedImageSchema: Schema = new Schema(
  {
    imageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cameraId: {
      type: String,
      required: true,
      index: true,
    },
    cameraLabel: {
      type: String,
      required: true,
    },
    s3Url: {
      type: String,
    },
    s3Key: {
      type: String,
    },
    localUrl: {
      type: String,
    },
    storageType: {
      type: String,
      enum: ['s3', 'local'],
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CapturedImage = mongoose.model<ICapturedImage>(
  'CapturedImage',
  CapturedImageSchema
);
