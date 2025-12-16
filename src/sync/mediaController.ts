/**
 * MediaController - Manages media state, file coordination, and voting system
 */

import { MeshNetwork } from '../p2p/meshNetwork';

export interface MediaState {
  type: 'local' | 'torrent' | null;
  filename: string | null;
  fileSize: number | null;
  magnetUri?: string;
  fileIndex?: number;
  loadedBy: string; // peer ID
  loadedByName: string; // peer nickname
}

export interface FileUploadStatus {
  peerId: string;
  nickname: string;
  hasFile: boolean;
  filename?: string;
  fileSize?: number;
}

export interface VoteRequest {
  requestId: string;
  mediaType: 'local' | 'torrent';
  filename: string;
  fileSize?: number;
  magnetUri?: string;
  fileIndex?: number;
  requestedBy: string;
  requestedByName: string;
  startTime: number;
  votes: Map<string, boolean>; // peerId -> accept/reject
  timeout: NodeJS.Timeout;
}

export class MediaController {
  private network: MeshNetwork;
  private currentMedia: MediaState | null = null;
  private pendingFileUploads: Map<string, FileUploadStatus> = new Map();
  private activeVoteRequest: VoteRequest | null = null;

  // Callbacks
  private onMediaReadyCallback: (() => void) | null = null;
  private onWaitingForFilesCallback: ((status: FileUploadStatus[]) => void) | null = null;
  private onVoteRequestCallback: ((request: VoteRequest) => void) | null = null;
  private onVoteUpdateCallback: ((yesCount: number, noCount: number, total: number) => void) | null = null;
  private onVoteResultCallback: ((accepted: boolean) => void) | null = null;
  private onMediaChangeCallback: ((oldMedia: MediaState | null, newMedia: MediaState) => void) | null = null;

  constructor(network: MeshNetwork) {
    this.network = network;
    this.setupMessageHandlers();
  }

  /**
   * Setup message handlers for media coordination
   */
  private setupMessageHandlers(): void {
    this.network.onMessage((message: any, senderId: string) => {
      switch (message.type) {
        case 'media_loaded':
          this.handleMediaLoaded(message, senderId);
          break;
        case 'file_uploaded':
          this.handleFileUploaded(message, senderId);
          break;
        case 'media_change_request':
          this.handleMediaChangeRequest(message, senderId);
          break;
        case 'vote_response':
          this.handleVoteResponse(message, senderId);
          break;
      }
    });
  }

  /**
   * Load local video file - initiates coordination
   */
  loadLocalFile(filename: string, fileSize: number): void {
    const localId = this.network.getLocalId();
    const localName = this.network.getLocalNickname();

    // If there's already media loaded, initiate voting
    if (this.currentMedia) {
      this.requestMediaChange('local', filename, fileSize);
      return;
    }

    // First load - set as current media
    this.currentMedia = {
      type: 'local',
      filename,
      fileSize,
      loadedBy: localId,
      loadedByName: localName,
    };

    // Broadcast to all peers
    this.network.broadcast({
      type: 'media_loaded',
      mediaType: 'local',
      filename,
      fileSize,
      loadedBy: localId,
      loadedByName: localName,
    });

    // Initialize file upload tracking
    this.initializeFileCoordination();
  }

  /**
   * Load torrent - simpler, no file coordination needed
   */
  loadTorrent(magnetUri: string, filename: string, fileSize: number, fileIndex?: number): void {
    const localId = this.network.getLocalId();
    const localName = this.network.getLocalNickname();

    // If there's already media loaded, initiate voting
    if (this.currentMedia) {
      this.requestMediaChange('torrent', filename, fileSize, magnetUri, fileIndex);
      return;
    }

    // First load - set as current media
    this.currentMedia = {
      type: 'torrent',
      filename,
      fileSize,
      magnetUri,
      fileIndex,
      loadedBy: localId,
      loadedByName: localName,
    };

    // Broadcast to all peers
    this.network.broadcast({
      type: 'media_loaded',
      mediaType: 'torrent',
      filename,
      fileSize,
      magnetUri,
      fileIndex,
      loadedBy: localId,
      loadedByName: localName,
    });

    // Torrent is ready immediately (peers auto-download)
    if (this.onMediaReadyCallback) {
      this.onMediaReadyCallback();
    }
  }

  /**
   * Initialize file coordination for local files
   */
  private initializeFileCoordination(): void {
    this.pendingFileUploads.clear();

    // Add all peers (including self) to tracking
    const localId = this.network.getLocalId();
    const localName = this.network.getLocalNickname();
    const peers = this.network.getConnectedPeers();

    // Add self (already has file)
    this.pendingFileUploads.set(localId, {
      peerId: localId,
      nickname: localName,
      hasFile: true,
      filename: this.currentMedia!.filename!,
      fileSize: this.currentMedia!.fileSize!,
    });

    // Add all peers (waiting for them to upload)
    peers.forEach((peer: any) => {
      this.pendingFileUploads.set(peer.id, {
        peerId: peer.id,
        nickname: peer.nickname,
        hasFile: false,
      });
    });

    // Notify UI
    this.updateFileCoordinationStatus();
  }

  /**
   * Handle incoming media loaded message
   */
  private handleMediaLoaded(message: any, senderId: string): void {
    // If we already have media, ignore (they should send a change request instead)
    if (this.currentMedia) {
      return;
    }

    // Set current media from peer
    this.currentMedia = {
      type: message.mediaType,
      filename: message.filename,
      fileSize: message.fileSize,
      magnetUri: message.magnetUri,
      fileIndex: message.fileIndex,
      loadedBy: senderId,
      loadedByName: message.loadedByName || 'Unknown',
    };

    if (message.mediaType === 'local') {
      // Local file - need to wait for user to upload
      this.initializeFileCoordination();
    } else {
      // Torrent - ready immediately
      if (this.onMediaReadyCallback) {
        this.onMediaReadyCallback();
      }
    }
  }

  /**
   * Confirm local file uploaded by current user
   */
  confirmLocalFileUploaded(filename: string, fileSize: number): boolean {
    if (!this.currentMedia || this.currentMedia.type !== 'local') {
      return false;
    }

    // Verify filename and size match
    if (filename !== this.currentMedia.filename || fileSize !== this.currentMedia.fileSize) {
      return false; // Mismatch
    }

    const localId = this.network.getLocalId();

    // Update local status
    const status = this.pendingFileUploads.get(localId);
    if (status) {
      status.hasFile = true;
      status.filename = filename;
      status.fileSize = fileSize;
    }

    // Broadcast to peers
    this.network.broadcast({
      type: 'file_uploaded',
      filename,
      fileSize,
      uploadedBy: localId,
      uploadedByName: this.network.getLocalNickname(),
    });

    // Check if all ready
    this.checkAllFilesReady();
    this.updateFileCoordinationStatus();

    return true;
  }

  /**
   * Handle file uploaded message from peer
   */
  private handleFileUploaded(message: any, senderId: string): void {
    if (!this.currentMedia || this.currentMedia.type !== 'local') {
      return;
    }

    // Verify filename and size match
    if (
      message.filename !== this.currentMedia.filename ||
      message.fileSize !== this.currentMedia.fileSize
    ) {
      console.warn(`File mismatch from ${message.uploadedByName}`);
      return;
    }

    // Update peer status
    const status = this.pendingFileUploads.get(senderId);
    if (status) {
      status.hasFile = true;
      status.filename = message.filename;
      status.fileSize = message.fileSize;
    }

    // Check if all ready
    this.checkAllFilesReady();
    this.updateFileCoordinationStatus();
  }

  /**
   * Check if all peers have uploaded the file
   */
  private checkAllFilesReady(): void {
    const allReady = Array.from(this.pendingFileUploads.values()).every((s) => s.hasFile);

    if (allReady && this.onMediaReadyCallback) {
      this.onMediaReadyCallback();
    }
  }

  /**
   * Update file coordination status UI
   */
  private updateFileCoordinationStatus(): void {
    if (this.onWaitingForFilesCallback) {
      const statuses = Array.from(this.pendingFileUploads.values());
      this.onWaitingForFilesCallback(statuses);
    }
  }

  /**
   * Request media change (initiates voting)
   */
  private requestMediaChange(
    mediaType: 'local' | 'torrent',
    filename: string,
    fileSize: number,
    magnetUri?: string,
    fileIndex?: number
  ): void {
    const requestId = `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const localId = this.network.getLocalId();
    const localName = this.network.getLocalNickname();

    // Create vote request
    this.activeVoteRequest = {
      requestId,
      mediaType,
      filename,
      fileSize,
      magnetUri,
      fileIndex,
      requestedBy: localId,
      requestedByName: localName,
      startTime: Date.now(),
      votes: new Map(),
      timeout: setTimeout(() => {
        this.finalizeVote();
      }, 30000), // 30 second timeout
    };

    // Auto-vote yes for self
    this.activeVoteRequest.votes.set(localId, true);

    // Broadcast vote request
    this.network.broadcast({
      type: 'media_change_request',
      requestId,
      mediaType,
      filename,
      fileSize,
      magnetUri,
      fileIndex,
      requestedBy: localId,
      requestedByName: localName,
    });

    // Update vote count
    this.updateVoteCount();
  }

  /**
   * Handle incoming media change request
   */
  private handleMediaChangeRequest(message: any, senderId: string): void {
    // If we already have an active vote, ignore
    if (this.activeVoteRequest) {
      return;
    }

    // Create vote request
    this.activeVoteRequest = {
      requestId: message.requestId,
      mediaType: message.mediaType,
      filename: message.filename,
      fileSize: message.fileSize,
      magnetUri: message.magnetUri,
      fileIndex: message.fileIndex,
      requestedBy: senderId,
      requestedByName: message.requestedByName,
      startTime: Date.now(),
      votes: new Map(),
      timeout: setTimeout(() => {
        this.finalizeVote();
      }, 30000),
    };

    // Notify UI to show voting modal
    if (this.onVoteRequestCallback) {
      this.onVoteRequestCallback(this.activeVoteRequest);
    }
  }

  /**
   * Submit vote (accept or reject)
   */
  submitVote(accept: boolean): void {
    if (!this.activeVoteRequest) {
      return;
    }

    const localId = this.network.getLocalId();
    this.activeVoteRequest.votes.set(localId, accept);

    // Broadcast vote
    this.network.broadcast({
      type: 'vote_response',
      requestId: this.activeVoteRequest.requestId,
      vote: accept,
      voterId: localId,
      voterName: this.network.getLocalNickname(),
    });

    // Update vote count
    this.updateVoteCount();

    // Check if we should finalize early (if all peers voted)
    const totalPeers = this.network.getConnectedPeers().length + 1; // +1 for self
    if (this.activeVoteRequest.votes.size >= totalPeers) {
      this.finalizeVote();
    }
  }

  /**
   * Handle vote response from peer
   */
  private handleVoteResponse(message: any, senderId: string): void {
    if (!this.activeVoteRequest || message.requestId !== this.activeVoteRequest.requestId) {
      return;
    }

    this.activeVoteRequest.votes.set(senderId, message.vote);

    // Update vote count
    this.updateVoteCount();

    // Check if all peers voted
    const totalPeers = this.network.getConnectedPeers().length + 1;
    if (this.activeVoteRequest.votes.size >= totalPeers) {
      this.finalizeVote();
    }
  }

  /**
   * Update vote count and notify UI
   */
  private updateVoteCount(): void {
    if (!this.activeVoteRequest) return;

    const votes = Array.from(this.activeVoteRequest.votes.values());
    const yesCount = votes.filter((v) => v).length;
    const noCount = votes.filter((v) => !v).length;
    const totalPeers = this.network.getConnectedPeers().length + 1;

    if (this.onVoteUpdateCallback) {
      this.onVoteUpdateCallback(yesCount, noCount, totalPeers);
    }
  }

  /**
   * Finalize vote and apply result
   */
  private finalizeVote(): void {
    if (!this.activeVoteRequest) return;

    clearTimeout(this.activeVoteRequest.timeout);

    const votes = Array.from(this.activeVoteRequest.votes.values());
    const yesCount = votes.filter((v) => v).length;
    const noCount = votes.filter((v) => !v).length;

    // Need >50% to accept
    const accepted = yesCount > noCount;

    if (this.onVoteResultCallback) {
      this.onVoteResultCallback(accepted);
    }

    if (accepted) {
      // Apply media change
      const oldMedia = this.currentMedia;
      const newMedia: MediaState = {
        type: this.activeVoteRequest.mediaType,
        filename: this.activeVoteRequest.filename,
        fileSize: this.activeVoteRequest.fileSize ?? null,
        magnetUri: this.activeVoteRequest.magnetUri,
        fileIndex: this.activeVoteRequest.fileIndex,
        loadedBy: this.activeVoteRequest.requestedBy,
        loadedByName: this.activeVoteRequest.requestedByName,
      };
      this.currentMedia = newMedia;

      if (this.onMediaChangeCallback && oldMedia !== null) {
        this.onMediaChangeCallback(oldMedia, newMedia);
      }

      // If local file, reinitialize coordination
      if (newMedia.type === 'local') {
        this.initializeFileCoordination();
      } else {
        // Torrent - ready immediately
        if (this.onMediaReadyCallback) {
          this.onMediaReadyCallback();
        }
      }
    }

    this.activeVoteRequest = null;
  }

  /**
   * Get current media state
   */
  getCurrentMedia(): MediaState | null {
    return this.currentMedia;
  }

  /**
   * Get file upload status
   */
  getFileUploadStatus(): FileUploadStatus[] {
    return Array.from(this.pendingFileUploads.values());
  }

  /**
   * Check if all files are ready
   */
  areAllFilesReady(): boolean {
    if (!this.currentMedia || this.currentMedia.type !== 'local') {
      return true; // Torrent doesn't need coordination
    }
    return Array.from(this.pendingFileUploads.values()).every((s) => s.hasFile);
  }

  /**
   * Clear current media
   */
  clearMedia(): void {
    this.currentMedia = null;
    this.pendingFileUploads.clear();
    if (this.activeVoteRequest) {
      clearTimeout(this.activeVoteRequest.timeout);
      this.activeVoteRequest = null;
    }
  }

  // Callback setters
  onMediaReady(callback: () => void): void {
    this.onMediaReadyCallback = callback;
  }

  onWaitingForFiles(callback: (status: FileUploadStatus[]) => void): void {
    this.onWaitingForFilesCallback = callback;
  }

  onVoteRequest(callback: (request: VoteRequest) => void): void {
    this.onVoteRequestCallback = callback;
  }

  onVoteUpdate(callback: (yesCount: number, noCount: number, total: number) => void): void {
    this.onVoteUpdateCallback = callback;
  }

  onVoteResult(callback: (accepted: boolean) => void): void {
    this.onVoteResultCallback = callback;
  }

  onMediaChange(callback: (oldMedia: MediaState | null, newMedia: MediaState) => void): void {
    this.onMediaChangeCallback = callback;
  }
}
