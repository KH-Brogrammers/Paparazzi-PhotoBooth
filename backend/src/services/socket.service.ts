import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

export class SocketService {
  private io: SocketServer;
  private screenSockets: Map<string, string>; // screenId -> socketId
  private primaryCameraSocket: string | null = null; // Track primary camera
  private cameraSockets: Set<string> = new Set(); // Track all camera sockets
  private cameraDeviceMap: Map<string, string> = new Map(); // socketId -> deviceId

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
      socket.on('register:screen', async (screenId: string) => {
        this.screenSockets.set(screenId, socket.id);
        socket.join(`screen:${screenId}`);
        console.log(`📺 Screen registered: ${screenId} (${socket.id})`);
        
        socket.emit('registered', { screenId, socketId: socket.id });
        
        // Notify admin panels about new screen
        this.io.emit('screen:registered', { screenId });
      });

      // Camera registration - determine primary/secondary based on device ID order
      socket.on('register:camera', (cameraId: string) => {
        this.cameraSockets.add(socket.id);
        this.cameraDeviceMap.set(socket.id, cameraId);
        socket.join(`camera:${cameraId}`);
        
        // Get all camera device IDs and sort them to determine consistent primary
        const allCameraDeviceIds = Array.from(this.cameraDeviceMap.values()).sort();
        const primaryDeviceId = allCameraDeviceIds[0];
        
        // This camera is primary if its device ID is the first in sorted order
        const isPrimary = cameraId === primaryDeviceId;
        
        if (isPrimary) {
          // Update primary camera socket
          this.primaryCameraSocket = socket.id;
          
          // Notify other cameras they are now secondary
          this.cameraDeviceMap.forEach((deviceId, socketId) => {
            if (socketId !== socket.id && deviceId !== primaryDeviceId) {
              this.io.to(socketId).emit('camera:status', { isPrimary: false });
            }
          });
        }
        
        console.log(`📷 Camera registered: ${cameraId} (${socket.id}) - ${isPrimary ? 'PRIMARY' : 'SECONDARY'}`);
        
        // Send primary/secondary status to camera
        socket.emit('camera:status', { isPrimary });
        
        // Notify admin panels about primary status change
        this.io.emit('camera:primary-updated', { deviceId: cameraId, isPrimary });
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

      // Handle hide QR code command from primary camera
      socket.on('camera:hide-qr-code', () => {
        if (socket.id === this.primaryCameraSocket) {
          console.log('🏠 Hide QR code command from primary camera');
          // Broadcast to all cameras including primary
          this.io.emit('camera:hide-qr-code');
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
        
        // Broadcast to admin panels and all camera devices
        this.io.emit('cameras:registered', camerasWithRole);
      });

      // Handle admin request for cameras
      socket.on('admin:request-cameras', () => {
        console.log(`📋 Admin requesting cameras`);
        // Broadcast request to all camera devices
        socket.broadcast.emit('admin:request-cameras');
      });

      // Handle admin toggle screen details
      socket.on('admin:toggle-screen-details', ({ show }) => {
        console.log(`📺 Admin toggling screen details: ${show ? 'show' : 'hide'}`);
        // Broadcast to all screens
        this.io.emit('screen:toggle-details', { show });
      });

      // Handle admin toggle camera details
      socket.on('admin:toggle-camera-details', ({ show }) => {
        console.log(`📷 Admin toggling camera details: ${show ? 'show' : 'hide'}`);
        // Broadcast to all camera devices
        this.io.emit('admin:toggle-camera-details', { show });
      });

      // Handle screen refresh request
      socket.on('screen:refresh', ({ screenId }) => {
        console.log(`🔄 Refresh request for screen: ${screenId}`);
        // Send refresh signal to specific screen
        this.io.to(`screen:${screenId}`).emit('screen:refresh');
        console.log(`🔄 Refresh signal sent to screen room: screen:${screenId}`);
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        
        // Handle camera disconnection
        if (this.cameraSockets.has(socket.id)) {
          this.cameraSockets.delete(socket.id);
          const disconnectedDeviceId = this.cameraDeviceMap.get(socket.id);
          this.cameraDeviceMap.delete(socket.id);
          
          // If primary camera disconnected, assign new primary
          if (socket.id === this.primaryCameraSocket) {
            this.primaryCameraSocket = null;
            
            // Assign new primary from remaining cameras (first in sorted order)
            const remainingDeviceIds = Array.from(this.cameraDeviceMap.values()).sort();
            if (remainingDeviceIds.length > 0) {
              const newPrimaryDeviceId = remainingDeviceIds[0];
              const newPrimarySocketId = Array.from(this.cameraDeviceMap.entries())
                .find(([_, deviceId]) => deviceId === newPrimaryDeviceId)?.[0];
              
              if (newPrimarySocketId) {
                this.primaryCameraSocket = newPrimarySocketId;
                this.io.to(newPrimarySocketId).emit('camera:status', { isPrimary: true });
                // Notify admin panels about new primary
                this.io.emit('camera:primary-updated', { deviceId: newPrimaryDeviceId, isPrimary: true });
                console.log(`📷 New primary camera assigned: ${newPrimaryDeviceId} (${newPrimarySocketId})`);
              }
            }
          }
        }
        
        // Handle screen disconnection - remove from database after delay
        for (const [screenId, socketId] of this.screenSockets.entries()) {
          if (socketId === socket.id) {
            this.screenSockets.delete(screenId);
            console.log(`📺 Screen disconnected: ${screenId}`);
            
            // Remove screen from database after 5 seconds to prevent duplicates
            setTimeout(async () => {
              try {
                const { Screen } = await import('../models/screen.model');
                await Screen.findOneAndDelete({ screenId });
                console.log(`📺 Screen removed from database: ${screenId}`);
              } catch (error) {
                console.error('Error removing screen from database:', error);
              }
            }, 5000);
            
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

  // Broadcast screen capture to collage screen
  public broadcastScreenCapture(screenId: string, captureData: any): void {
    this.io.emit('screen:capture-ready', {
      screenId,
      ...captureData
    });
    console.log(`📤 Screen capture from ${screenId} broadcasted to collage`);
  }

  // Broadcast collage update
  public broadcastCollageUpdate(screenId: string, isCollageScreen: boolean): void {
    this.io.emit('collage:updated', { screenId, isCollageScreen });
    console.log(`📤 Collage update broadcasted: ${screenId} is ${isCollageScreen ? 'now' : 'no longer'} collage screen`);
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

  // Emit to all camera screens (primary and secondary)
  public emitToAllCameras(data: any): void {
    this.cameraSockets.forEach((socketId) => {
      this.io.to(socketId).emit('qr_code_generated', data);
    });
    console.log(`📤 QR code sent to ${this.cameraSockets.size} camera screens`);
  }

  public getIO(): SocketServer {
    return this.io;
  }

  // Method to make a specific camera primary
  public makeCameraPrimary(cameraId: string): boolean {
    // Find the socket ID for this camera
    const targetSocketId = Array.from(this.cameraDeviceMap.entries())
      .find(([socketId, deviceId]) => deviceId === cameraId)?.[0];

    if (!targetSocketId || !this.cameraSockets.has(targetSocketId)) {
      console.error(`❌ Camera ${cameraId} not found or not connected`);
      return false;
    }

    // Update primary camera
    const oldPrimarySocket = this.primaryCameraSocket;
    this.primaryCameraSocket = targetSocketId;

    // Notify old primary it's now secondary
    if (oldPrimarySocket && this.cameraSockets.has(oldPrimarySocket)) {
      this.io.to(oldPrimarySocket).emit('camera:status', { isPrimary: false });
    }

    // Notify new primary
    this.io.to(targetSocketId).emit('camera:status', { isPrimary: true });

    // Broadcast updated camera list to admin panels
    this.io.emit('cameras:updated');

    console.log(`✅ Camera ${cameraId} is now PRIMARY`);
    return true;
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
