import { MeshNetwork, SyncMessage, MediaSource } from '../p2p/meshNetwork';

export interface VideoState {
  isPlaying: boolean;
  position: number;
  timestamp: number;
  playbackRate: number;
}

export interface BufferingInfo {
  peerId: string;
  nickname: string;
  isBuffering: boolean;
}

export class SyncManager {
  private network: MeshNetwork;
  private videoElement: HTMLVideoElement | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private onStateUpdateCallback: ((state: VideoState) => void) | null = null;
  private onBufferingChangeCallback: ((info: BufferingInfo) => void) | null = null;
  private onMediaSourceCallback: ((source: MediaSource) => void) | null = null;
  private videoDuration: number = 0;
  private lastSyncTime: number = 0;
  private isLocalAction: boolean = false;

  // Sync tuning parameters
  private driftThreshold = 0.3; // 300ms - no correction needed
  private softCorrectionThreshold = 0.7; // 700ms - adjust playback rate
  private hardSeekThreshold = 2.0; // 2s - hard seek
  private baseSyncIntervalMs = 500;
  private adaptiveSyncIntervalMs = 500;
  private maxSyncIntervalMs = 2000;
  private minSyncIntervalMs = 200;

  // Network latency tracking
  private latencyBuffer: number[] = [];
  private averageLatency: number = 0;

  // Buffering coordination - stores peerId -> nickname mapping
  private peersBuffering: Map<string, string> = new Map();
  private wasPlayingBeforeBuffer: boolean = false;

  constructor(network: MeshNetwork) {
    this.network = network;
    this.setupMessageHandler();
  }

  /**
   * Set the video element to control
   */
  setVideoElement(videoElement: HTMLVideoElement): void {
    this.videoElement = videoElement;
    this.videoDuration = videoElement.duration || 0;

    this.setupVideoListeners();

    // Start sync loop if we're the leader
    if (this.network.isLeader()) {
      this.startSyncLoop();
    }
  }

  /**
   * Setup video element event listeners
   */
  private setupVideoListeners(): void {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('play', () => {
      if (!this.isLocalAction) {
        this.handleLocalPlay();
      }
    });

    this.videoElement.addEventListener('pause', () => {
      if (!this.isLocalAction) {
        this.handleLocalPause();
      }
    });

    this.videoElement.addEventListener('seeked', () => {
      if (!this.isLocalAction) {
        this.handleLocalSeek();
      }
    });

    this.videoElement.addEventListener('loadedmetadata', () => {
      if (this.videoElement) {
        this.videoDuration = this.videoElement.duration;
        console.log('Video duration:', this.videoDuration);
      }
    });

    this.videoElement.addEventListener('waiting', () => {
      this.handleLocalBuffering(true);
    });

    this.videoElement.addEventListener('playing', () => {
      this.handleLocalBuffering(false);
    });

    this.videoElement.addEventListener('canplay', () => {
      this.handleLocalBuffering(false);
    });

    this.videoElement.addEventListener('ratechange', () => {
      // Track playback rate changes for debugging
      console.log('Playback rate changed to:', this.videoElement?.playbackRate);
    });
  }

  /**
   * Handle local play event
   */
  private handleLocalPlay(): void {
    if (!this.videoElement) return;

    // If we're buffering, don't send play
    if (this.peersBuffering.size > 0) return;

    const message: SyncMessage = {
      type: 'play',
      isPlaying: true,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
    };

    this.network.broadcast(message);
    this.updateAdaptiveSync(true); // Faster sync when playing
  }

  /**
   * Handle local pause event
   */
  private handleLocalPause(): void {
    if (!this.videoElement) return;

    const message: SyncMessage = {
      type: 'pause',
      isPlaying: false,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
    };

    this.network.broadcast(message);
    this.updateAdaptiveSync(false); // Slower sync when paused
  }

  /**
   * Handle local seek event
   */
  private handleLocalSeek(): void {
    if (!this.videoElement) return;

    const message: SyncMessage = {
      type: 'seek',
      position: this.videoElement.currentTime,
      isPlaying: !this.videoElement.paused,
      timestamp: Date.now(),
    };

    this.network.broadcast(message);
  }

  /**
   * Handle local buffering state
   */
  private handleLocalBuffering(isBuffering: boolean): void {
    if (!this.videoElement) return;

    const message: SyncMessage = {
      type: 'buffering',
      isBuffering,
      senderId: this.network.getLocalId(),
      senderNickname: this.network.getLocalNickname(),
      bufferingUserId: this.network.getLocalId(),
      bufferingUserNickname: this.network.getLocalNickname(),
      position: this.videoElement.currentTime,
    };

    this.network.broadcast(message);

    if (this.onBufferingChangeCallback) {
      this.onBufferingChangeCallback({
        peerId: this.network.getLocalId(),
        nickname: this.network.getLocalNickname(),
        isBuffering,
      });
    }
  }

  /**
   * Setup message handler for incoming sync messages
   */
  private setupMessageHandler(): void {
    this.network.onMessage((message: SyncMessage, senderId: string) => {
      this.handleSyncMessage(message, senderId);
    });

    // Listen for leader changes
    this.network.onLeaderChange((leaderId: string) => {
      if (leaderId === this.network.getLocalId()) {
        // We became the leader, start sync loop
        this.startSyncLoop();
      } else {
        // We're not the leader anymore, stop sync loop
        this.stopSyncLoop();
      }
    });
  }

  /**
   * Handle incoming sync message
   */
  private handleSyncMessage(message: SyncMessage, senderId: string): void {
    // Handle media_source even without video element
    if (message.type === 'media_source' && message.mediaSource) {
      if (this.onMediaSourceCallback) {
        this.onMediaSourceCallback(message.mediaSource);
      }
      return;
    }

    if (!this.videoElement) return;

    switch (message.type) {
      case 'play':
        this.applyPlay(message);
        break;
      case 'pause':
        this.applyPause(message);
        break;
      case 'seek':
        this.applySeek(message);
        break;
      case 'sync':
        this.applySync(message);
        break;
      case 'buffering':
        this.handlePeerBuffering(
          message.bufferingUserId || senderId,
          message.bufferingUserNickname || 'Unknown',
          message.isBuffering || false
        );
        break;
      case 'ready':
        console.log('Peer ready:', senderId);
        if (this.network.isLeader()) {
          this.sendCurrentState();
        }
        break;
    }
  }

  /**
   * Apply play command
   */
  private async applyPlay(message: SyncMessage): Promise<void> {
    if (!this.videoElement || message.position === undefined) return;

    this.isLocalAction = true;

    // Sync position first
    const drift = Math.abs(this.videoElement.currentTime - message.position);
    if (drift > this.driftThreshold) {
      this.videoElement.currentTime = message.position;
    }

    // Play
    if (this.videoElement.paused) {
      try {
        await this.videoElement.play();
      } catch (error) {
        console.error('Error playing video:', error);
      }
    }

    this.isLocalAction = false;
    this.updateAdaptiveSync(true);
  }

  /**
   * Apply pause command
   */
  private applyPause(message: SyncMessage): void {
    if (!this.videoElement || message.position === undefined) return;

    this.isLocalAction = true;

    // Sync position
    const drift = Math.abs(this.videoElement.currentTime - message.position);
    if (drift > this.driftThreshold) {
      this.videoElement.currentTime = message.position;
    }

    // Pause
    if (!this.videoElement.paused) {
      this.videoElement.pause();
    }

    this.isLocalAction = false;
    this.updateAdaptiveSync(false);
  }

  /**
   * Apply seek command
   */
  private applySeek(message: SyncMessage): void {
    if (!this.videoElement || message.position === undefined) return;

    this.isLocalAction = true;

    this.videoElement.currentTime = message.position;

    if (message.isPlaying && this.videoElement.paused) {
      this.videoElement.play().catch((error) => {
        console.error('Error playing after seek:', error);
      });
    } else if (!message.isPlaying && !this.videoElement.paused) {
      this.videoElement.pause();
    }

    this.isLocalAction = false;
  }

  /**
   * Apply sync update (drift correction) - improved algorithm
   */
  private applySync(message: SyncMessage): void {
    if (
      !this.videoElement ||
      message.position === undefined ||
      message.isPlaying === undefined ||
      message.timestamp === undefined
    ) {
      return;
    }

    // Don't apply sync if we just received one recently (avoid feedback loop)
    const now = Date.now();
    if (now - this.lastSyncTime < 200) {
      return;
    }
    this.lastSyncTime = now;

    // Track network latency
    const latency = now - message.timestamp;
    this.updateLatencyEstimate(latency);

    // Calculate expected position accounting for network latency
    const elapsed = (latency + this.averageLatency / 2) / 1000;
    const expectedPosition = message.isPlaying
      ? message.position + elapsed
      : message.position;

    // Calculate drift
    const drift = this.videoElement.currentTime - expectedPosition;
    const absDrift = Math.abs(drift);

    if (absDrift < this.driftThreshold) {
      // Small drift - no correction needed
      this.videoElement.playbackRate = 1.0;
      return;
    }

    this.isLocalAction = true;

    if (absDrift > this.hardSeekThreshold) {
      // Large drift - hard seek
      console.log(`Large drift (${absDrift.toFixed(2)}s), hard seeking`);
      this.videoElement.currentTime = expectedPosition;
      this.videoElement.playbackRate = 1.0;
    } else if (absDrift > this.softCorrectionThreshold) {
      // Medium-large drift - faster rate adjustment
      const adjustment = drift > 0 ? -0.08 : 0.08;
      this.videoElement.playbackRate = 1.0 + adjustment;

      // Reset to normal speed after catching up
      setTimeout(() => {
        if (this.videoElement) {
          this.videoElement.playbackRate = 1.0;
        }
      }, 1500);
    } else {
      // Small-medium drift - gentle rate adjustment
      const adjustment = drift > 0 ? -0.03 : 0.03;
      this.videoElement.playbackRate = 1.0 + adjustment;

      // Reset to normal speed
      setTimeout(() => {
        if (this.videoElement) {
          this.videoElement.playbackRate = 1.0;
        }
      }, 1000);
    }

    // Sync play/pause state
    if (message.isPlaying && this.videoElement.paused) {
      this.videoElement.play().catch(console.error);
    } else if (!message.isPlaying && !this.videoElement.paused) {
      this.videoElement.pause();
    }

    this.isLocalAction = false;
  }

  /**
   * Handle peer buffering state
   */
  private handlePeerBuffering(peerId: string, nickname: string, isBuffering: boolean): void {
    if (isBuffering) {
      // Peer started buffering
      if (this.peersBuffering.size === 0 && this.videoElement && !this.videoElement.paused) {
        this.wasPlayingBeforeBuffer = true;
        this.isLocalAction = true;
        this.videoElement.pause();
        this.isLocalAction = false;
      }
      this.peersBuffering.set(peerId, nickname);
    } else {
      // Peer stopped buffering
      this.peersBuffering.delete(peerId);

      if (this.peersBuffering.size === 0 && this.wasPlayingBeforeBuffer && this.videoElement) {
        this.wasPlayingBeforeBuffer = false;
        this.isLocalAction = true;
        this.videoElement.play().catch(console.error);
        this.isLocalAction = false;
      }
    }

    if (this.onBufferingChangeCallback) {
      this.onBufferingChangeCallback({ peerId, nickname, isBuffering });
    }
  }

  /**
   * Get all peers currently buffering
   */
  getBufferingPeers(): Map<string, string> {
    return new Map(this.peersBuffering);
  }

  /**
   * Check if any peer is buffering
   */
  isAnyPeerBuffering(): boolean {
    return this.peersBuffering.size > 0;
  }

  /**
   * Update network latency estimate
   */
  private updateLatencyEstimate(latency: number): void {
    this.latencyBuffer.push(latency);
    if (this.latencyBuffer.length > 10) {
      this.latencyBuffer.shift();
    }

    // Calculate average, excluding outliers
    const sorted = [...this.latencyBuffer].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    this.averageLatency = trimmed.length > 0
      ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length
      : latency;
  }

  /**
   * Update adaptive sync interval based on playback state
   */
  private updateAdaptiveSync(isPlaying: boolean): void {
    if (isPlaying) {
      // Faster sync when playing
      this.adaptiveSyncIntervalMs = Math.max(
        this.minSyncIntervalMs,
        this.baseSyncIntervalMs / 2
      );
    } else {
      // Slower sync when paused (save resources)
      this.adaptiveSyncIntervalMs = Math.min(
        this.maxSyncIntervalMs,
        this.baseSyncIntervalMs * 2
      );
    }

    // Restart sync loop with new interval
    if (this.network.isLeader()) {
      this.stopSyncLoop();
      this.startSyncLoop();
    }
  }

  /**
   * Start sync loop (leader only)
   */
  private startSyncLoop(): void {
    if (!this.network.isLeader()) return;

    this.syncInterval = setInterval(() => {
      this.sendSyncUpdate();
    }, this.adaptiveSyncIntervalMs);
  }

  /**
   * Stop sync loop
   */
  private stopSyncLoop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Send sync update to peers
   */
  private sendSyncUpdate(): void {
    if (!this.videoElement || !this.network.isLeader()) return;

    const message: SyncMessage = {
      type: 'sync',
      isPlaying: !this.videoElement.paused,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
    };

    this.network.broadcast(message);
  }

  /**
   * Send current state to new peer
   */
  private sendCurrentState(): void {
    if (!this.videoElement || !this.network.isLeader()) return;

    const message: SyncMessage = {
      type: 'sync',
      isPlaying: !this.videoElement.paused,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
      videoDuration: this.videoDuration,
    };

    this.network.broadcast(message);
  }

  /**
   * Notify that we're ready to sync
   */
  notifyReady(): void {
    const message: SyncMessage = {
      type: 'ready',
      videoDuration: this.videoDuration,
    };

    this.network.broadcast(message);
  }

  /**
   * Get current video state
   */
  getCurrentState(): VideoState | null {
    if (!this.videoElement) return null;

    return {
      isPlaying: !this.videoElement.paused,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
      playbackRate: this.videoElement.playbackRate,
    };
  }

  /**
   * Set callback for state updates
   */
  onStateUpdate(callback: (state: VideoState) => void): void {
    this.onStateUpdateCallback = callback;
  }

  /**
   * Set callback for buffering changes
   */
  onBufferingChange(callback: (info: BufferingInfo) => void): void {
    this.onBufferingChangeCallback = callback;
  }

  /**
   * Set callback for media source changes (when peer broadcasts torrent)
   */
  onMediaSource(callback: (source: MediaSource) => void): void {
    this.onMediaSourceCallback = callback;
  }

  /**
   * Get video duration
   */
  getVideoDuration(): number {
    return this.videoDuration;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stopSyncLoop();
    this.videoElement = null;
    this.peersBuffering.clear();
  }
}
