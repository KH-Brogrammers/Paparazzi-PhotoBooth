import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import { config } from './config/env.config';
import { connectDatabase } from './config/database.config';
import { initializeSocketService } from './services/socket.service';
import { collageService } from './services/collage.service';
import { routes } from './routes';

const app: Application = express();
const httpServer = http.createServer(app);

// Initialize Socket.io
const socketService = initializeSocketService(httpServer);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api', routes);

// Health check
// API endpoint to make a camera primary
app.post('/api/cameras/make-primary', (req: Request, res: Response) => {
  const { cameraId } = req.body;
  
  if (!cameraId) {
    return res.status(400).json({ error: 'Camera ID is required' });
  }
  
  const success = socketService.makeCameraPrimary(cameraId);
  
  if (success) {
    res.status(200).json({ message: `Camera ${cameraId} is now primary` });
  } else {
    res.status(404).json({ error: 'Camera not found or not connected' });
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Connect to MongoDB and start server
const PORT = config.port;

const startServer = async () => {
  try {
    await connectDatabase();
    
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📸 Photo Shoot Backend API ready!`);
      console.log(`🔌 Socket.io initialized`);
      
      // Generate missing collages on startup (non-blocking)
      setTimeout(async () => {
        try {
          console.log('🎨 Checking for missing collages...');
          await collageService.generateMissingCollages();
          console.log('✅ Missing collages check completed');
        } catch (error) {
          console.error('❌ Error generating missing collages on startup:', error);
        }
      }, 5000); // Wait 5 seconds after server start
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
