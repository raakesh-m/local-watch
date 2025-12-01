import { P2PConnection, SyncMessage } from '../p2p/connection';

export interface VideoState {
  isPlaying: boolean;
  position: number;
  timestamp: number;
}

export class SyncManager {
  private connection: P2PConnection;
  private isHost: boolean;
  private videoElement: HTMLVideoElement | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private onStateUpdateCallback: ((state: VideoState) => void) | null = null;
  private videoDuration: number = 0;
  private lastSyncTime: number = 0;
  private driftThreshold = 0.3; // 300ms
  private hardSeekThreshold = 0.7; // 700ms
  private syncIntervalMs = 500; // Send sync every 500ms

  constructor(connection: P2PConnection, isHost: boolean) {
    this.connection = connection;
    this.isHost = isHost;
    this.setupMessageHandler();
  }

  /**
   * Set the video element to control
   */
  setVideoElement(videoElement: HTMLVideoElement): void {
    this.videoElement = videoElement;
    this.videoDuration = videoElement.duration;

    // Setup video event listeners
    this.setupVideoListeners();

    // Start sync loop if host
    if (this.isHost) {
      this.startSyncLoop();
    }
  }

  /**
   * Setup video element event listeners
   */
  private setupVideoListeners(): void {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('play', () => {
      this.handleLocalPlay();
    });

    this.videoElement.addEventListener('pause', () => {
      this.handleLocalPause();
    });

    this.videoElement.addEventListener('seeked', () => {
      this.handleLocalSeek();
    });

    this.videoElement.addEventListener('loadedmetadata', () => {
      if (this.videoElement) {
        this.videoDuration = this.videoElement.duration;
        console.log('Video duration:', this.videoDuration);
      }
    });
  }

  /**
   * Handle local play event
   */
  private handleLocalPlay(): void {
    if (!this.videoElement) return;

    const message: SyncMessage = {
      type: 'play',
      isPlaying: true,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
    };

    if (this.isHost) {
      this.connection.broadcast(message);
    } else {
      this.connection.sendMessage(message);
    }
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

    if (this.isHost) {
      this.connection.broadcast(message);
    } else {
      this.connection.sendMessage(message);
    }
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

    if (this.isHost) {
      this.connection.broadcast(message);
    } else {
      this.connection.sendMessage(message);
    }
  }

  /**
   * Setup message handler for incoming sync messages
   */
  private setupMessageHandler(): void {
    this.connection.onMessage((message: SyncMessage) => {
      this.handleSyncMessage(message);
    });
  }

  /**
   * Handle incoming sync message
   */
  private handleSyncMessage(message: SyncMessage): void {
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
      case 'ready':
        console.log('Peer ready:', message.userId);
        break;
      case 'join':
        console.log('Peer joined:', message.userId);
        // If we're the host, send current state
        if (this.isHost) {
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
  }

  /**
   * Apply pause command
   */
  private applyPause(message: SyncMessage): void {
    if (!this.videoElement || message.position === undefined) return;

    // Sync position
    const drift = Math.abs(this.videoElement.currentTime - message.position);
    if (drift > this.driftThreshold) {
      this.videoElement.currentTime = message.position;
    }

    // Pause
    if (!this.videoElement.paused) {
      this.videoElement.pause();
    }
  }

  /**
   * Apply seek command
   */
  private applySeek(message: SyncMessage): void {
    if (!this.videoElement || message.position === undefined) return;

    this.videoElement.currentTime = message.position;

    if (message.isPlaying && this.videoElement.paused) {
      this.videoElement.play().catch((error) => {
        console.error('Error playing after seek:', error);
      });
    } else if (!message.isPlaying && !this.videoElement.paused) {
      this.videoElement.pause();
    }
  }

  /**
   * Apply sync update (drift correction)
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

    // Calculate expected position based on elapsed time since message
    const elapsed = (now - message.timestamp) / 1000;
    const expectedPosition = message.isPlaying
      ? message.position + elapsed
      : message.position;

    // Calculate drift
    const drift = Math.abs(this.videoElement.currentTime - expectedPosition);

    if (drift < this.driftThreshold) {
      // Small drift - no correction needed
      return;
    } else if (drift < this.hardSeekThreshold) {
      // Medium drift - micro-adjust playback rate
      if (message.isPlaying) {
        const adjustment = drift > 0.5 ? 0.05 : 0.02;
        this.videoElement.playbackRate =
          this.videoElement.currentTime < expectedPosition
            ? 1.0 + adjustment
            : 1.0 - adjustment;

        // Reset to normal speed after a short time
        setTimeout(() => {
          if (this.videoElement) {
            this.videoElement.playbackRate = 1.0;
          }
        }, 1000);
      }
    } else {
      // Large drift - hard seek
      console.log(
        `Large drift detected (${drift.toFixed(2)}s), hard seeking`
      );
      this.videoElement.currentTime = expectedPosition;
    }

    // Sync play/pause state
    if (message.isPlaying && this.videoElement.paused) {
      this.videoElement.play().catch((error) => {
        console.error('Error playing during sync:', error);
      });
    } else if (!message.isPlaying && !this.videoElement.paused) {
      this.videoElement.pause();
    }
  }

  /**
   * Start sync loop (host only)
   */
  private startSyncLoop(): void {
    if (!this.isHost) return;

    this.syncInterval = setInterval(() => {
      this.sendSyncUpdate();
    }, this.syncIntervalMs);
  }

  /**
   * Send sync update to peers
   */
  private sendSyncUpdate(): void {
    if (!this.videoElement || !this.isHost) return;

    const message: SyncMessage = {
      type: 'sync',
      isPlaying: !this.videoElement.paused,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
    };

    this.connection.broadcast(message);
  }

  /**
   * Send current state to new peer
   */
  private sendCurrentState(): void {
    if (!this.videoElement || !this.isHost) return;

    const message: SyncMessage = {
      type: 'sync',
      isPlaying: !this.videoElement.paused,
      position: this.videoElement.currentTime,
      timestamp: Date.now(),
      videoDuration: this.videoDuration,
    };

    this.connection.broadcast(message);
  }

  /**
   * Notify that we're ready to sync
   */
  notifyReady(userId: string): void {
    const message: SyncMessage = {
      type: 'ready',
      userId: userId,
      videoDuration: this.videoDuration,
    };

    this.connection.sendMessage(message);
  }

  /**
   * Set callback for state updates
   */
  onStateUpdate(callback: (state: VideoState) => void): void {
    this.onStateUpdateCallback = callback;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.videoElement = null;
  }
}
