# Photo Shoot Studio - Multi-Camera Multi-Screen System

A professional photo shoot application with multi-camera capture and multi-screen display capabilities.

## 🚀 Features

- **Multi-Camera Support**: Automatically detects and manages all connected cameras
- **Multi-Screen Display**: Detects multiple screens using Window Placement API
- **Real-time Socket Communication**: Instant image broadcast to mapped screens
- **S3 Storage**: Primary storage with presigned URLs for direct upload
- **MongoDB Persistence**: Stores all image history and screen/camera mappings
- **Admin Panel**: Easy camera-to-screen mapping configuration
- **Responsive UI**: Beautiful Tailwind CSS design

## 📁 Project Structure

```
photo-shoot/
├── backend/           # Node.js + Express + TypeScript + Socket.io
│   ├── src/
│   │   ├── config/    # Database & environment config
│   │   ├── models/    # MongoDB schemas
│   │   ├── controllers/ # Request handlers
│   │   ├── routes/    # API endpoints
│   │   ├── services/  # Business logic & Socket.io
│   │   └── index.ts   # Entry point
│   └── package.json
│
└── frontend/          # React + TypeScript + Vite
    ├── src/
    │   ├── components/ # Reusable UI components
    │   ├── hooks/      # Custom React hooks
    │   ├── pages/      # Route pages (/, /screens, /admin)
    │   ├── services/   # API clients & Socket.io
    │   ├── types/      # TypeScript interfaces
    │   └── utils/      # Helper functions
    └── package.json
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+ and npm/yarn
- MongoDB (local or Atlas)
- AWS Account (optional, for S3 storage)

### Backend Setup

1. Navigate to backend folder:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
# or
yarn
```

3. Create `.env` file (copy from `.env.example`):
```env
PORT=8800
MONGODB_URI=mongodb://localhost:27017/photo-shoot
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_S3_BUCKET_NAME=your_bucket_name_here
```

4. Start MongoDB:
```bash
# If using local MongoDB
mongod
```

5. Start development server:
```bash
npm run dev
# or
yarn dev
```

Backend will run on `http://localhost:8800`

### Frontend Setup

1. Navigate to frontend folder:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
# or
yarn
```

3. Start development server:
```bash
npm run dev
# or
yarn dev
```

Frontend will run on `http://localhost:5173` (or another port if 5173 is busy)

## 📱 Application Routes

### 1. `/` - Camera Page (Root)
- **Purpose**: Main camera capture interface
- **Features**:
  - Automatically detects all connected cameras
  - Live preview from all cameras
  - Single "Capture All Cameras" button
  - Flash effect on capture
  - Stores images to S3 (primary) or IndexedDB (fallback)
  - Sends captured images to MongoDB
  - Emits socket events to mapped screens

### 2. `/screens` - Display Page
- **Purpose**: Runs on each physical display/monitor
- **Features**:
  - Auto-detects screen using Window Placement API
  - Falls back to unique ID generation if API not available
  - Auto-registers with backend
  - Shows logo/branding by default
  - Displays images from mapped cameras in real-time
  - Connects via Socket.io for instant updates

**Setup**: Open this page on each monitor you want to use as a display.

### 3. `/admin` - Admin Panel
- **Purpose**: Configure camera-to-screen mappings
- **Features**:
  - Lists all registered screens
  - Shows all detected cameras
  - Simple checkbox interface for mapping
  - Save mappings to MongoDB
  - Real-time broadcast of mapping updates
  - Rename screens for easier identification

## 🔄 System Flow

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Camera    │────────▶│   Backend    │────────▶│   Screen A   │
│  Page (/)   │         │ (Socket.io)  │         │  (/screens)  │
└─────────────┘         └──────────────┘         └──────────────┘
      │                        │                         ▲
      │                        │                         │
      ▼                        ▼                         │
┌─────────────┐         ┌──────────────┐               │
│  IndexedDB  │         │   MongoDB    │               │
│   (Local)   │         │ (Persistent) │               │
└─────────────┘         └──────────────┘               │
      │                        │                         │
      │                        ▼                         │
      │                 ┌──────────────┐               │
      └────────────────▶│  AWS S3      │───────────────┘
                        │  (Storage)   │
                        └──────────────┘
```

## 🔌 API Endpoints

### Presigned URLs
- `POST /api/presigned-url/generate` - Generate S3 presigned URL

### Screens
- `POST /api/screens/register` - Register/update a screen
- `GET /api/screens` - Get all screens
- `PATCH /api/screens/:screenId/label` - Update screen label
- `DELETE /api/screens/:screenId` - Delete screen

### Mappings
- `GET /api/mappings` - Get all camera-to-screen mappings
- `GET /api/mappings/:cameraId` - Get mapping for specific camera
- `POST /api/mappings` - Update/create mapping
- `DELETE /api/mappings/:cameraId` - Delete mapping

### Images
- `POST /api/images` - Save captured image
- `GET /api/images` - Get all images (with optional filters)
- `GET /api/images/:imageId` - Get specific image
- `DELETE /api/images/:imageId` - Delete image

### Health Check
- `GET /health` - Server health status

## 🔌 Socket.io Events

### Client → Server
- `register:screen` - Register screen with ID
- `register:camera` - Register camera with ID

### Server → Client
- `registered` - Confirmation of registration
- `image:captured` - New image captured (sent to mapped screens)
- `mappings:updated` - Mappings configuration updated

## 💾 MongoDB Collections

### `screens`
```javascript
{
  screenId: String (unique),
  label: String,
  position: { left: Number, top: Number },
  resolution: { width: Number, height: Number },
  isPrimary: Boolean,
  isAvailable: Boolean,
  lastSeen: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### `capturedimages`
```javascript
{
  imageId: String (unique),
  cameraId: String,
  cameraLabel: String,
  s3Url: String (optional),
  s3Key: String (optional),
  localUrl: String (optional),
  storageType: 's3' | 'local',
  timestamp: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### `cameramappings`
```javascript
{
  cameraId: String (unique),
  cameraLabel: String,
  screenIds: [String],
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## 🎯 Usage Workflow

1. **Setup Cameras** (Root `/`):
   - Open browser on your main computer
   - Navigate to `http://localhost:5173/`
   - Grant camera permissions when prompted
   - All cameras will be detected automatically

2. **Setup Screens** (`/screens`):
   - Open separate browser windows on each physical display
   - Navigate to `http://localhost:5173/screens` on each
   - Each screen will auto-register with the system
   - Screens will show logo/branding by default

3. **Configure Mappings** (`/admin`):
   - Open admin panel: `http://localhost:5173/admin`
   - You'll see all registered screens and cameras
   - Check boxes to map which cameras should display on which screens
   - Click "Save All Mappings"

4. **Start Capturing**:
   - Return to camera page (`/`)
   - Click "Capture All Cameras" button
   - Images will instantly appear on mapped screens
   - All images saved to MongoDB and S3/IndexedDB

## 🐛 Troubleshooting

### Window Placement API Not Working
- Only supported in Chrome/Edge with flags enabled
- Enable: `chrome://flags/#enable-experimental-web-platform-features`
- System will fallback to unique ID generation automatically

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod`
- Check connection string in `.env`
- For MongoDB Atlas, whitelist your IP

### Socket Connection Failed
- Verify backend is running on port 8800
- Check CORS settings
- Ensure firewall allows connections

### Camera Access Denied
- Grant camera permissions in browser
- Check browser console for specific errors
- Try refreshing the page

### Images Not Appearing on Screens
- Verify mappings are saved in admin panel
- Check socket connection on screens page
- Ensure backend Socket.io is running
- Check browser console for errors

## 🔐 Security Notes

- **Production**: Update CORS settings to specific domains
- **MongoDB**: Use authentication in production
- **AWS**: Use IAM roles with minimal permissions
- **Socket.io**: Implement authentication for production use

## 📦 Technologies Used

### Backend
- Node.js + Express
- TypeScript
- MongoDB + Mongoose
- Socket.io
- AWS SDK (S3)

### Frontend
- React 19
- TypeScript
- Vite
- React Router 7
- Socket.io Client
- Tailwind CSS 4

## 📄 License

MIT

## 👨‍💻 Author

Built for professional photo shoot studios with multiple camera and display requirements.
