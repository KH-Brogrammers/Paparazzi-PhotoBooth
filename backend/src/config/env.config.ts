import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 8800,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/photo-shoot',
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3BucketName: process.env.AWS_S3_BUCKET_NAME || '',
  },
};
