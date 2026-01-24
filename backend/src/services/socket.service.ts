import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

export class SocketService {
  private io: SocketServer;
  private screenSockets: Map<string, string>; // screenId -> socketId
  private primaryCameraSocket: string | null = null; // Track primary camera
  private cameraSockets: Set<string> = new Set(); // Track all camera sockets

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
        
        // Notify admin panels about new screen
        this.io.emit('screen:registered', { screenId });
      });

      // Camera registration - determine primary/secondary
      socket.on('register:camera', (cameraId: string) => {
        this.cameraSockets.add(socket.id);
        socket.join(`camera:${cameraId}`);
        
        // Set as primary if no primary exists
        const isPrimary = !this.primaryCameraSocket;
        if (isPrimary) {
          this.primaryCameraSocket = socket.id;
        }
        
        console.log(`📷 Camera registered: ${cameraId} (${socket.id}) - ${isPrimary ? 'PRIMARY' : 'SECONDARY'}`);
        
        // Send primary/secondary status to camera
        socket.emit('camera:status', { isPrimary });
      });

      // Handle capture command from primary camera
      socket.on('camera:capture-all', () => {
        if (socket.id === this.primaryCameraSocket) {
          console.log('📸 Capture all command from primary camera');
          // Broadcast to all cameras including primary
          this.io.emit('camera:execute-capture');
        }
      });

      // Handle refresh command from primary camera
      socket.on('camera:refresh-all', () => {
        if (socket.id === this.primaryCameraSocket) {
          console.log('🔄 Refresh all command from primary camera');
          // Broadcast to all cameras including primary
          this.io.emit('camera:execute-refresh');
        }
      });

      // Handle camera registration from devices
      socket.on('cameras:register', (cameras: any[]) => {
        console.log(`📷 Cameras registered from device:`, cameras);
        
        // Add role information to cameras
        const camerasWithRole = cameras.map(camera => ({
          ...camera,
          role: socket.id === this.primaryCameraSocket ? 'PRIMARY' : 'SECONDARY',
          socketId: socket.id
        }));
        
        // Broadcast to admin panels
        this.io.emit('cameras:registered', camerasWithRole);
      });

      // Handle admin request for cameras
      socket.on('admin:request-cameras', () => {
        console.log(`📋 Admin requesting cameras`);
        // Broadcast request to all camera devices
        socket.broadcast.emit('admin:request-cameras');
      });

      // Handle screen refresh request
      socket.on('screen:refresh', ({ screenId }) => {
        console.log(`🔄 Refresh request for screen: ${screenId}`);
        // Send refresh signal to specific screen
        this.io.to(`screen:${screenId}`).emit('screen:refresh');
        console.log(`🔄 Refresh signal sent to screen room: screen:${screenId}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        
        // Handle camera disconnection
        if (this.cameraSockets.has(socket.id)) {
          this.cameraSockets.delete(socket.id);
          
          // If primary camera disconnected, assign new primary
          if (socket.id === this.primaryCameraSocket) {
            this.primaryCameraSocket = null;
            
            // Assign new primary from remaining cameras
            const remainingCameras = Array.from(this.cameraSockets);
            if (remainingCameras.length > 0) {
              this.primaryCameraSocket = remainingCameras[0];
              // Notify new primary
              this.io.to(this.primaryCameraSocket).emit('camera:status', { isPrimary: true });
              console.log(`📷 New primary camera assigned: ${this.primaryCameraSocket}`);
            }
          }
        }
        
        // Remove screen from map and notify admin panels
        for (const [screenId, socketId] of this.screenSockets.entries()) {
          if (socketId === socket.id) {
            this.screenSockets.delete(screenId);
            console.log(`📺 Screen unregistered: ${screenId}`);
            
            // Notify admin panels about disconnected screen
            this.io.emit('screen:disconnected', { screenId });
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

  // Clear all screens
  public clearAllScreens(): void {
    this.io.emit('screens:clear');
    console.log('📤 Clear signal sent to all screens');
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
