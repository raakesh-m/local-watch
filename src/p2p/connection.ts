import SimplePeer from 'simple-peer';

// Free Google STUN servers
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export interface SyncMessage {
  type: 'sync' | 'play' | 'pause' | 'seek' | 'join' | 'ready' | 'error';
  isPlaying?: boolean;
  position?: number;
  timestamp?: number;
  userId?: string;
  videoDuration?: number;
  error?: string;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export class P2PConnection {
  private peer: SimplePeer.Instance | null = null;
  private isHost: boolean;
  private roomCode: string | null = null;
  private onMessageCallback: ((message: SyncMessage) => void) | null = null;
  private onStatusCallback: ((status: ConnectionStatus) => void) | null = null;
  private connectedPeers: Map<string, SimplePeer.Instance> = new Map();

  constructor(isHost: boolean) {
    this.isHost = isHost;
  }

  /**
   * Initialize connection as host
   */
  async initAsHost(): Promise<string> {
    this.roomCode = this.generateRoomCode();
    this.updateStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.peer = new SimplePeer({
          initiator: true,
          trickle: false,
          config: { iceServers: ICE_SERVERS },
        });

        this.setupPeerListeners(this.peer);

        this.peer.on('signal', (signal) => {
          // In a real implementation, you'd send this signal to a signaling server
          // For now, we'll store it and let the user share it
          const signalData = JSON.stringify(signal);
          console.log('Host signal data:', signalData);
          resolve(this.roomCode!);
        });

        this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          this.updateStatus('error');
          reject(err);
        });
      } catch (error) {
        this.updateStatus('error');
        reject(error);
      }
    });
  }

  /**
   * Join a room as guest
   */
  async joinRoom(roomCode: string, hostSignal: string): Promise<void> {
    this.roomCode = roomCode;
    this.updateStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.peer = new SimplePeer({
          initiator: false,
          trickle: false,
          config: { iceServers: ICE_SERVERS },
        });

        this.setupPeerListeners(this.peer);

        this.peer.on('signal', (signal) => {
          // Guest generates their signal and needs to send back to host
          const signalData = JSON.stringify(signal);
          console.log('Guest signal data:', signalData);
        });

        this.peer.on('connect', () => {
          this.updateStatus('connected');
          resolve();
        });

        this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          this.updateStatus('error');
          reject(err);
        });

        // Signal the host
        const parsedSignal = JSON.parse(hostSignal);
        this.peer.signal(parsedSignal);
      } catch (error) {
        this.updateStatus('error');
        reject(error);
      }
    });
  }

  /**
   * Complete connection with guest signal (host only)
   */
  async connectWithGuest(guestSignal: string): Promise<void> {
    if (!this.isHost || !this.peer) {
      throw new Error('Only host can accept guest connections');
    }

    try {
      const parsedSignal = JSON.parse(guestSignal);
      this.peer.signal(parsedSignal);
      this.updateStatus('connected');
    } catch (error) {
      console.error('Error connecting with guest:', error);
      this.updateStatus('error');
      throw error;
    }
  }

  /**
   * Setup peer event listeners
   */
  private setupPeerListeners(peer: SimplePeer.Instance): void {
    peer.on('connect', () => {
      console.log('Peer connected');
      this.updateStatus('connected');
    });

    peer.on('data', (data) => {
      try {
        const message: SyncMessage = JSON.parse(data.toString());
        console.log('Received message:', message);
        if (this.onMessageCallback) {
          this.onMessageCallback(message);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    peer.on('close', () => {
      console.log('Peer connection closed');
      this.updateStatus('disconnected');
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      this.updateStatus('error');
    });
  }

  /**
   * Send message to connected peer(s)
   */
  sendMessage(message: SyncMessage): void {
    if (!this.peer || this.peer.destroyed) {
      console.warn('Cannot send message: peer not connected');
      return;
    }

    try {
      const data = JSON.stringify(message);
      this.peer.send(data);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  /**
   * Broadcast message to all connected peers (host only)
   */
  broadcast(message: SyncMessage): void {
    if (!this.isHost) {
      console.warn('Only host can broadcast');
      return;
    }

    this.sendMessage(message);

    // Also send to all other connected peers
    this.connectedPeers.forEach((peer) => {
      if (!peer.destroyed) {
        try {
          peer.send(JSON.stringify(message));
        } catch (error) {
          console.error('Error broadcasting to peer:', error);
        }
      }
    });
  }

  /**
   * Set callback for incoming messages
   */
  onMessage(callback: (message: SyncMessage) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * Set callback for status changes
   */
  onStatusChange(callback: (status: ConnectionStatus) => void): void {
    this.onStatusCallback = callback;
  }

  /**
   * Update connection status
   */
  private updateStatus(status: ConnectionStatus): void {
    if (this.onStatusCallback) {
      this.onStatusCallback(status);
    }
  }

  /**
   * Generate a random room code
   */
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Get the room code
   */
  getRoomCode(): string | null {
    return this.roomCode;
  }

  /**
   * Get host signal for sharing
   */
  getSignalData(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Signal generation timeout'));
      }, 10000);

      this.peer.on('signal', (signal) => {
        clearTimeout(timeout);
        resolve(JSON.stringify(signal));
      });
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.peer !== null && !this.peer.destroyed;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.connectedPeers.forEach((peer) => {
      peer.destroy();
    });
    this.connectedPeers.clear();

    this.updateStatus('disconnected');
  }
}
