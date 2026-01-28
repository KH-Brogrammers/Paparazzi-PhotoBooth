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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Connect to MongoDB and start server
const PORT = config.port;

const startServer = async () => {
  try {
    await connectDatabase();
    
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
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
