import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

export class SocketService {
  private io: SocketServer;
  private screenSockets: Map<string, string>; // screenId -> socketId

  constructor(httpServer: HTTPServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.screenSockets = new Map();
    this.initializeSocketHandlers();
  }

  private initializeSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Screen registration
      socket.on('register:screen', (screenId: string) => {
        this.screenSockets.set(screenId, socket.id);
        socket.join(`screen:${screenId}`);
        console.log(`📺 Screen registered: ${screenId} (${socket.id})`);
        
        socket.emit('registered', { screenId, socketId: socket.id });
      });

      // Camera registration
      socket.on('register:camera', (cameraId: string) => {
        socket.join(`camera:${cameraId}`);
        console.log(`📷 Camera registered: ${cameraId} (${socket.id})`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        
        // Remove screen from map
        for (const [screenId, socketId] of this.screenSockets.entries()) {
          if (socketId === socket.id) {
            this.screenSockets.delete(screenId);
            console.log(`📺 Screen unregistered: ${screenId}`);
            break;
          }
        }
      });
    });
  }

  // Emit captured image to specific screens
  public emitImageToScreens(screenIds: string[], imageData: any): void {
    screenIds.forEach((screenId) => {
      this.io.to(`screen:${screenId}`).emit('image:captured', imageData);
      console.log(`📤 Image sent to screen: ${screenId}`);
    });
  }

  // Broadcast mapping update to all clients
  public broadcastMappingUpdate(mappings: any): void {
    this.io.emit('mappings:updated', mappings);
    console.log('📤 Mapping update broadcasted');
  }

  // Get connected screens
  public getConnectedScreens(): string[] {
    return Array.from(this.screenSockets.keys());
  }

  public getIO(): SocketServer {
    return this.io;
  }
}

let socketService: SocketService | null = null;

export const initializeSocketService = (httpServer: HTTPServer): SocketService => {
  if (!socketService) {
    socketService = new SocketService(httpServer);
  }
  return socketService;
};

export const getSocketService = (): SocketService => {
  if (!socketService) {
    throw new Error('Socket service not initialized');
  }
  return socketService;
};
