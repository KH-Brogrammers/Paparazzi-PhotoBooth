import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BACKEND_URL || 'http://localhost:8800';

console.log('🔗 Socket URL:', SOCKET_URL);

class SocketClient {
  private socket: Socket | null = null;

  connect(): Socket {
    // If already connected, return existing socket
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // Disconnect any existing socket first
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('🔌 Connected to socket server');
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Disconnected from socket server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error);
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketClient = new SocketClient();
