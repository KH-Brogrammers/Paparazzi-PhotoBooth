import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import { config } from './config/env.config';
import { connectDatabase } from './config/database.config';
import { initializeSocketService } from './services/socket.service';
import { routes } from './routes';

const app: Application = express();
const httpServer = http.createServer(app);

// Initialize Socket.io
const socketService = initializeSocketService(httpServer);

// Middleware
app.use(cors());
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
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📸 Photo Shoot Backend API ready!`);
      console.log(`🔌 Socket.io initialized`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
