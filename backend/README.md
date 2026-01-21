# Photo Shoot Backend

Backend API server for the Photo Shoot application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the backend directory with your AWS credentials:
```env
PORT=8800
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_S3_BUCKET_NAME=your_bucket_name_here
```

3. Start the development server:
```bash
npm run dev
```

The server will start on http://localhost:8800

## API Endpoints

### Generate Presigned URL
- **POST** `/api/presigned-url/generate`
- **Body:**
  ```json
  {
    "fileName": "image.webp",
    "fileType": "image/webp",
    "cameraId": "camera-123"
  }
  ```
- **Response:**
  ```json
  {
    "url": "https://s3-presigned-url...",
    "key": "photos/camera-123/1234567890-image.webp",
    "expiresIn": 3600
  }
  ```

### Health Check
- **GET** `/health`
- **Response:**
  ```json
  {
    "status": "OK",
    "timestamp": "2026-01-22T00:00:00.000Z"
  }
  ```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Request handlers
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── types/           # TypeScript types
│   └── index.ts         # Entry point
├── .env.example         # Environment variables template
├── nodemon.json         # Nodemon configuration
├── package.json
└── tsconfig.json
```
