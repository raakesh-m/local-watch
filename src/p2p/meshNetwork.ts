import SimplePeer from 'simple-peer';
import { compressSignal, smartDecompress } from '../utils/compression';

// Free Google STUN servers
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export interface Peer {
  id: string;
  nickname: string;
  connection: SimplePeer.Instance;
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastSeen: number;
  priority: number; // For leader election
  signalData?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderNickname: string;
  content: string;
  timestamp: number;
}

// Media source types
export type MediaSourceType = 'local' | 'torrent';

export interface MediaSource {
  type: MediaSourceType;
  magnetUri?: string;        // For torrent
  fileIndex?: number;        // For multi-file torrents
  fileName?: string;         // Display name
  fileSize?: number;         // File size in bytes
}

export interface SyncMessage {
  type: 'sync' | 'play' | 'pause' | 'seek' | 'join' | 'ready' | 'error' |
        'chat' | 'peer_list' | 'leader_election' | 'ping' | 'pong' |
        'buffering' | 'request_signal' | 'signal_response' | 'user_info' | 'kick' |
        'media_source' | 'media_loaded' | 'file_uploaded' | 'media_change_request' | 'vote_response';
  senderId?: string;
  senderNickname?: string;
  isPlaying?: boolean;
  position?: number;
  timestamp?: number;
  videoDuration?: number;
  error?: string;
  // Chat
  chatMessage?: ChatMessage;
  // Peer management
  peers?: Array<{ id: string; nickname: string; priority: number }>;
  signalData?: string;
  targetPeerId?: string;
  // Leader election
  leaderId?: string;
  priority?: number;
  // File info
  fileSize?: number;
  fileDuration?: number;
  // Buffering - now includes user info
  isBuffering?: boolean;
  bufferingUserId?: string;
  bufferingUserNickname?: string;
  // Media source (for torrent sharing)
  mediaSource?: MediaSource;
  // Media coordination
  mediaType?: 'local' | 'torrent';
  filename?: string;
  magnetUri?: string;
  fileIndex?: number;
  loadedBy?: string;
  loadedByName?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  // Voting
  requestId?: string;
  requestedBy?: string;
  requestedByName?: string;
  vote?: boolean;
  voterId?: string;
  voterName?: string;
}

export type NetworkStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export class MeshNetwork {
  private localId: string;
  private localNickname: string;
  private localPriority: number;
  private peers: Map<string, Peer> = new Map();
  private leaderId: string | null = null;
  private roomCode: string | null = null;
  private isRoomCreator: boolean = false;

  // Pending connections for new peers joining via existing peers
  private pendingConnections: Map<string, SimplePeer.Instance> = new Map();

  // Callbacks
  private onMessageCallback: ((message: SyncMessage, senderId: string) => void) | null = null;
  private onPeerJoinCallback: ((peerId: string, nickname: string) => void) | null = null;
  private onPeerLeaveCallback: ((peerId: string, nickname: string) => void) | null = null;
  private onStatusChangeCallback: ((status: NetworkStatus) => void) | null = null;
  private onLeaderChangeCallback: ((leaderId: string) => void) | null = null;
  private onChatMessageCallback: ((message: ChatMessage) => void) | null = null;
  private onSignalForPeerCallback: ((peerId: string, signal: string) => void) | null = null;

  // Reconnection
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly RECONNECT_WINDOW_MS = 30000; // 30 seconds
  private readonly PING_INTERVAL_MS = 5000;
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(nickname: string) {
    this.localId = this.generateId();
    this.localNickname = nickname;
    this.localPriority = Date.now() + Math.random() * 1000;
  }

  private generateId(): string {
    return `peer_${Math.random().toString(36).substr(2, 12)}`;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new room as host
   */
  async createRoom(): Promise<{ roomCode: string; signalData: string }> {
    this.roomCode = this.generateRoomCode();
    this.isRoomCreator = true;
    this.leaderId = this.localId; // Creator is initial leader

    // Create initial peer connection for first guest
    const { signal } = await this.createInitiatorConnection();

    this.updateStatus('connected');

    return {
      roomCode: this.roomCode,
      signalData: compressSignal(signal),
    };
  }

  /**
   * Create an initiator connection (for host accepting new guests)
   */
  private async createInitiatorConnection(): Promise<{ peer: SimplePeer.Instance; signal: string }> {
    return new Promise((resolve, reject) => {
      const peer = new SimplePeer({
        initiator: true,
        trickle: false,
        config: { iceServers: ICE_SERVERS },
      });

      peer.on('signal', (signal) => {
        resolve({ peer, signal: JSON.stringify(signal) });
      });

      peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Join an existing room
   */
  async joinRoom(roomCode: string, hostSignal: string): Promise<string> {
    this.roomCode = roomCode;
    this.isRoomCreator = false;
    this.updateStatus('connecting');

    const decompressedSignal = smartDecompress(hostSignal);

    return new Promise((resolve, reject) => {
      const peer = new SimplePeer({
        initiator: false,
        trickle: false,
        config: { iceServers: ICE_SERVERS },
      });

      let guestSignal = '';

      peer.on('signal', (signal) => {
        guestSignal = JSON.stringify(signal);
      });

      peer.on('connect', () => {
        // We'll get the host's ID from their first message
        this.updateStatus('connected');

        // Send our info to the host
        const joinMessage: SyncMessage = {
          type: 'user_info',
          senderId: this.localId,
          senderNickname: this.localNickname,
          priority: this.localPriority,
        };
        peer.send(JSON.stringify(joinMessage));
      });

      peer.on('data', (data) => {
        this.handlePeerData(peer, data);
      });

      peer.on('close', () => {
        this.handlePeerDisconnect(peer);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        reject(err);
      });

      // Store temporarily until we know the peer's ID
      this.pendingConnections.set('host', peer);

      // Signal the host
      try {
        const parsedSignal = JSON.parse(decompressedSignal);
        peer.signal(parsedSignal);

        // Wait a moment for signal generation, then resolve
        setTimeout(() => {
          resolve(compressSignal(guestSignal));
        }, 1000);
      } catch (error) {
        reject(new Error('Invalid host signal data'));
      }
    });
  }

  /**
   * Connect with a guest's signal (host only)
   */
  async connectWithGuestSignal(guestSignal: string, guestId?: string): Promise<void> {
    const decompressedSignal = smartDecompress(guestSignal);

    // Find the pending peer connection or create new one
    let peer: SimplePeer.Instance;

    // If we have a pending initiator connection, use it
    const pendingPeers = Array.from(this.pendingConnections.values());
    if (pendingPeers.length > 0) {
      peer = pendingPeers[0];
      this.pendingConnections.clear();
    } else {
      // This shouldn't happen in normal flow, but handle it
      throw new Error('No pending connection for guest');
    }

    // Setup data handler if not already set
    peer.on('data', (data) => {
      this.handlePeerData(peer, data);
    });

    peer.on('close', () => {
      this.handlePeerDisconnect(peer);
    });

    // Signal the guest
    try {
      const parsedSignal = JSON.parse(decompressedSignal);
      peer.signal(parsedSignal);
    } catch (error) {
      throw new Error('Invalid guest signal data');
    }
  }

  /**
   * Generate new signal for additional guest (after first one connected)
   */
  async generateSignalForNewGuest(): Promise<string> {
    const { peer, signal } = await this.createInitiatorConnection();

    peer.on('data', (data) => {
      this.handlePeerData(peer, data);
    });

    peer.on('close', () => {
      this.handlePeerDisconnect(peer);
    });

    peer.on('connect', () => {
      // Send user info
      const infoMessage: SyncMessage = {
        type: 'user_info',
        senderId: this.localId,
        senderNickname: this.localNickname,
        priority: this.localPriority,
        leaderId: this.leaderId || undefined,
      };
      peer.send(JSON.stringify(infoMessage));

      // Send current peer list
      this.broadcastPeerList();
    });

    // Store as pending
    this.pendingConnections.set(`pending_${Date.now()}`, peer);

    return compressSignal(signal);
  }

  /**
   * Handle incoming data from a peer
   */
  private handlePeerData(peer: SimplePeer.Instance, data: Buffer | string): void {
    try {
      const message: SyncMessage = JSON.parse(data.toString());
      const senderId = message.senderId || 'unknown';

      // Handle user_info to register the peer
      if (message.type === 'user_info' && message.senderId && message.senderNickname) {
        this.registerPeer(peer, message.senderId, message.senderNickname, message.priority || 0);

        if (message.leaderId) {
          this.leaderId = message.leaderId;
        }

        // Send our info back
        const response: SyncMessage = {
          type: 'user_info',
          senderId: this.localId,
          senderNickname: this.localNickname,
          priority: this.localPriority,
          leaderId: this.leaderId || undefined,
        };
        peer.send(JSON.stringify(response));

        return;
      }

      // Handle ping/pong for connection health
      if (message.type === 'ping') {
        const pong: SyncMessage = { type: 'pong', senderId: this.localId };
        peer.send(JSON.stringify(pong));
        return;
      }

      if (message.type === 'pong') {
        const peerEntry = this.findPeerByConnection(peer);
        if (peerEntry) {
          peerEntry.lastSeen = Date.now();
        }
        return;
      }

      // Handle chat messages
      if (message.type === 'chat' && message.chatMessage) {
        if (this.onChatMessageCallback) {
          this.onChatMessageCallback(message.chatMessage);
        }
        // Relay to other peers (mesh broadcast)
        this.relayMessage(message, senderId);
        return;
      }

      // Handle leader election
      if (message.type === 'leader_election') {
        this.handleLeaderElection(message);
        return;
      }

      // Handle peer list updates
      if (message.type === 'peer_list') {
        // Could use this to discover new peers in the mesh
        return;
      }

      // Update last seen
      const peerEntry = this.peers.get(senderId);
      if (peerEntry) {
        peerEntry.lastSeen = Date.now();
      }

      // Forward to message callback
      if (this.onMessageCallback) {
        this.onMessageCallback(message, senderId);
      }

      // Relay sync messages to all other peers (for mesh)
      if (['sync', 'play', 'pause', 'seek', 'buffering', 'media_source'].includes(message.type)) {
        this.relayMessage(message, senderId);
      }
    } catch (error) {
      console.error('Error parsing peer data:', error);
    }
  }

  /**
   * Register a newly connected peer
   */
  private registerPeer(
    connection: SimplePeer.Instance,
    peerId: string,
    nickname: string,
    priority: number
  ): void {
    // Remove from pending if it was there
    for (const [key, pending] of this.pendingConnections) {
      if (pending === connection) {
        this.pendingConnections.delete(key);
        break;
      }
    }

    // Check if already registered
    if (this.peers.has(peerId)) {
      const existing = this.peers.get(peerId)!;
      existing.connection = connection;
      existing.status = 'connected';
      existing.lastSeen = Date.now();
      return;
    }

    const peer: Peer = {
      id: peerId,
      nickname,
      connection,
      status: 'connected',
      lastSeen: Date.now(),
      priority,
    };

    this.peers.set(peerId, peer);

    // Start ping interval
    this.startPingInterval(peerId);

    // Notify listener
    if (this.onPeerJoinCallback) {
      this.onPeerJoinCallback(peerId, nickname);
    }

    // Run leader election
    this.electLeader();

    console.log(`Peer registered: ${nickname} (${peerId})`);
  }

  /**
   * Handle peer disconnection
   */
  private handlePeerDisconnect(peer: SimplePeer.Instance): void {
    const peerEntry = this.findPeerByConnection(peer);
    if (!peerEntry) return;

    const peerId = peerEntry.id;
    const nickname = peerEntry.nickname;

    console.log(`Peer disconnected: ${nickname}, starting reconnection window`);

    // Update status to reconnecting
    peerEntry.status = 'reconnecting';

    // Clear ping interval
    const pingInterval = this.pingIntervals.get(peerId);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(peerId);
    }

    // Start reconnection timeout
    const timeout = setTimeout(() => {
      // If still not reconnected, remove the peer
      const currentPeer = this.peers.get(peerId);
      if (currentPeer && currentPeer.status === 'reconnecting') {
        this.peers.delete(peerId);
        this.reconnectTimeouts.delete(peerId);

        if (this.onPeerLeaveCallback) {
          this.onPeerLeaveCallback(peerId, nickname);
        }

        // If leader left, elect new one
        if (this.leaderId === peerId) {
          this.electLeader();
        }

        console.log(`Peer removed after reconnection timeout: ${nickname}`);
      }
    }, this.RECONNECT_WINDOW_MS);

    this.reconnectTimeouts.set(peerId, timeout);

    // Update network status
    this.updateStatus('reconnecting');
  }

  /**
   * Find peer by connection instance
   */
  private findPeerByConnection(connection: SimplePeer.Instance): Peer | undefined {
    for (const peer of this.peers.values()) {
      if (peer.connection === connection) {
        return peer;
      }
    }
    return undefined;
  }

  /**
   * Start ping interval for a peer
   */
  private startPingInterval(peerId: string): void {
    const interval = setInterval(() => {
      const peer = this.peers.get(peerId);
      if (peer && peer.status === 'connected' && !peer.connection.destroyed) {
        try {
          const ping: SyncMessage = { type: 'ping', senderId: this.localId };
          peer.connection.send(JSON.stringify(ping));
        } catch (error) {
          console.error('Error sending ping:', error);
        }
      }
    }, this.PING_INTERVAL_MS);

    this.pingIntervals.set(peerId, interval);
  }

  /**
   * Relay a message to all peers except the sender
   */
  private relayMessage(message: SyncMessage, excludeId: string): void {
    for (const [peerId, peer] of this.peers) {
      if (peerId !== excludeId && peer.status === 'connected' && !peer.connection.destroyed) {
        try {
          peer.connection.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error relaying to ${peer.nickname}:`, error);
        }
      }
    }
  }

  /**
   * Broadcast a message to all connected peers
   */
  broadcast(message: SyncMessage): void {
    message.senderId = this.localId;
    message.senderNickname = this.localNickname;

    for (const peer of this.peers.values()) {
      if (peer.status === 'connected' && !peer.connection.destroyed) {
        try {
          peer.connection.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error broadcasting to ${peer.nickname}:`, error);
        }
      }
    }
  }

  /**
   * Send a message to a specific peer
   */
  sendToPeer(peerId: string, message: SyncMessage): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.status === 'connected' && !peer.connection.destroyed) {
      message.senderId = this.localId;
      message.senderNickname = this.localNickname;
      try {
        peer.connection.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending to ${peer.nickname}:`, error);
      }
    }
  }

  /**
   * Send a chat message
   */
  sendChatMessage(content: string): void {
    const chatMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      senderId: this.localId,
      senderNickname: this.localNickname,
      content,
      timestamp: Date.now(),
    };

    const message: SyncMessage = {
      type: 'chat',
      senderId: this.localId,
      chatMessage,
    };

    this.broadcast(message);

    // Also trigger local callback
    if (this.onChatMessageCallback) {
      this.onChatMessageCallback(chatMessage);
    }
  }

  /**
   * Broadcast media source (torrent/local) to all peers
   * Used when host sets up a torrent for everyone to load
   */
  broadcastMediaSource(mediaSource: MediaSource): void {
    const message: SyncMessage = {
      type: 'media_source',
      senderId: this.localId,
      senderNickname: this.localNickname,
      mediaSource,
    };

    this.broadcast(message);
  }

  /**
   * Broadcast buffering status with user info
   */
  broadcastBuffering(isBuffering: boolean): void {
    const message: SyncMessage = {
      type: 'buffering',
      senderId: this.localId,
      senderNickname: this.localNickname,
      isBuffering,
      bufferingUserId: this.localId,
      bufferingUserNickname: this.localNickname,
    };

    this.broadcast(message);
  }

  /**
   * Broadcast current peer list
   */
  private broadcastPeerList(): void {
    const peerList = Array.from(this.peers.values()).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      priority: p.priority,
    }));

    // Add self
    peerList.push({
      id: this.localId,
      nickname: this.localNickname,
      priority: this.localPriority,
    });

    const message: SyncMessage = {
      type: 'peer_list',
      peers: peerList,
      leaderId: this.leaderId || undefined,
    };

    this.broadcast(message);
  }

  /**
   * Leader election using Bully algorithm
   */
  private electLeader(): void {
    // Find all connected peers including self
    const candidates = [
      { id: this.localId, priority: this.localPriority },
    ];

    for (const peer of this.peers.values()) {
      if (peer.status === 'connected') {
        candidates.push({ id: peer.id, priority: peer.priority });
      }
    }

    // Highest priority wins
    candidates.sort((a, b) => b.priority - a.priority);
    const newLeader = candidates[0].id;

    if (this.leaderId !== newLeader) {
      this.leaderId = newLeader;
      console.log(`New leader elected: ${newLeader === this.localId ? 'Me' : this.peers.get(newLeader)?.nickname}`);

      // Notify callback
      if (this.onLeaderChangeCallback) {
        this.onLeaderChangeCallback(newLeader);
      }

      // Broadcast leader election result
      const message: SyncMessage = {
        type: 'leader_election',
        leaderId: newLeader,
      };
      this.broadcast(message);
    }
  }

  /**
   * Handle leader election message from peer
   */
  private handleLeaderElection(message: SyncMessage): void {
    if (message.leaderId) {
      this.leaderId = message.leaderId;
      if (this.onLeaderChangeCallback) {
        this.onLeaderChangeCallback(message.leaderId);
      }
    }
  }

  /**
   * Update network status
   */
  private updateStatus(status: NetworkStatus): void {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status);
    }
  }

  // Getters
  getLocalId(): string {
    return this.localId;
  }

  getLocalNickname(): string {
    return this.localNickname;
  }

  getRoomCode(): string | null {
    return this.roomCode;
  }

  isLeader(): boolean {
    return this.leaderId === this.localId;
  }

  getLeaderId(): string | null {
    return this.leaderId;
  }

  getPeers(): Map<string, Peer> {
    return this.peers;
  }

  getConnectedPeerCount(): number {
    let count = 0;
    for (const peer of this.peers.values()) {
      if (peer.status === 'connected') {
        count++;
      }
    }
    return count;
  }

  getConnectedPeers(): Peer[] {
    const connectedPeers: Peer[] = [];
    for (const peer of this.peers.values()) {
      if (peer.status === 'connected') {
        connectedPeers.push(peer);
      }
    }
    return connectedPeers;
  }

  isRoomHost(): boolean {
    return this.isRoomCreator;
  }

  // Callbacks
  onMessage(callback: (message: SyncMessage, senderId: string) => void): void {
    this.onMessageCallback = callback;
  }

  onPeerJoin(callback: (peerId: string, nickname: string) => void): void {
    this.onPeerJoinCallback = callback;
  }

  onPeerLeave(callback: (peerId: string, nickname: string) => void): void {
    this.onPeerLeaveCallback = callback;
  }

  onStatusChange(callback: (status: NetworkStatus) => void): void {
    this.onStatusChangeCallback = callback;
  }

  onLeaderChange(callback: (leaderId: string) => void): void {
    this.onLeaderChangeCallback = callback;
  }

  onChatMessage(callback: (message: ChatMessage) => void): void {
    this.onChatMessageCallback = callback;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    // Clear all reconnect timeouts
    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();

    // Clear all ping intervals
    for (const interval of this.pingIntervals.values()) {
      clearInterval(interval);
    }
    this.pingIntervals.clear();

    // Destroy all peer connections
    for (const peer of this.peers.values()) {
      if (!peer.connection.destroyed) {
        peer.connection.destroy();
      }
    }
    this.peers.clear();

    // Destroy pending connections
    for (const peer of this.pendingConnections.values()) {
      if (!peer.destroyed) {
        peer.destroy();
      }
    }
    this.pendingConnections.clear();

    this.roomCode = null;
    this.leaderId = null;
    this.updateStatus('disconnected');
  }
}
