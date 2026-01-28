import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BACKEND_URL || 'http://localhost:8800';

console.log('🔗 Socket URL:', SOCKET_URL);

class SocketClient {
  private socket: Socket | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        transports: ['polling', 'websocket'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 5,
        upgrade: false, // Disable transport upgrades for dev tunnels
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
    }

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
