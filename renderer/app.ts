// This file will be compiled and included in the renderer process
// Import the necessary modules from the bundled code

import { P2PConnection, ConnectionStatus } from '../src/p2p/connection';
import { SyncManager } from '../src/sync/syncManager';

class LocalWatchApp {
  private currentScreen: string = 'home';
  private connection: P2PConnection | null = null;
  private syncManager: SyncManager | null = null;
  private isHost: boolean = false;
  private selectedVideoPath: string | null = null;
  private videoDuration: number = 0;
  private userId: string;

  constructor() {
    this.userId = this.generateUserId();
    this.initializeEventListeners();
  }

  private generateUserId(): string {
    return `user_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeEventListeners(): void {
    // Home screen
    document
      .getElementById('create-room-btn')
      ?.addEventListener('click', () => this.showCreateRoom());
    document
      .getElementById('join-room-btn')
      ?.addEventListener('click', () => this.showJoinRoom());

    // Create room
    document
      .getElementById('create-back-btn')
      ?.addEventListener('click', () => this.showHome());
    document
      .getElementById('select-video-btn')
      ?.addEventListener('click', () => this.selectVideo('host'));
    document
      .getElementById('copy-code-btn')
      ?.addEventListener('click', () => this.copyRoomCode());
    document
      .getElementById('copy-signal-btn')
      ?.addEventListener('click', () => this.copyHostSignal());
    document
      .getElementById('connect-guest-btn')
      ?.addEventListener('click', () => this.connectGuest());
    document
      .getElementById('start-watching-btn')
      ?.addEventListener('click', () => this.startWatching());

    // Join room
    document
      .getElementById('join-back-btn')
      ?.addEventListener('click', () => this.showHome());
    document
      .getElementById('join-select-video-btn')
      ?.addEventListener('click', () => this.selectVideo('guest'));
    document
      .getElementById('copy-guest-signal-btn')
      ?.addEventListener('click', () => this.copyGuestSignal());
    document
      .getElementById('join-room-connect-btn')
      ?.addEventListener('click', () => this.joinRoom());

    // Player
    document
      .getElementById('exit-player-btn')
      ?.addEventListener('click', () => this.exitPlayer());
    document
      .getElementById('play-pause-btn')
      ?.addEventListener('click', () => this.togglePlayPause());
    document
      .getElementById('fullscreen-btn')
      ?.addEventListener('click', () => this.toggleFullscreen());

    // Seek bar
    const seekBar = document.getElementById('seek-bar') as HTMLInputElement;
    seekBar?.addEventListener('input', () => this.handleSeekBarInput());
    seekBar?.addEventListener('change', () => this.handleSeek());

    // Error modal
    document
      .getElementById('error-ok-btn')
      ?.addEventListener('click', () => this.hideError());
  }

  private showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.remove('active');
    });
    document.getElementById(screenId)?.classList.add('active');
    this.currentScreen = screenId;
  }

  private showHome(): void {
    this.cleanup();
    this.showScreen('home-screen');
  }

  private async showCreateRoom(): Promise<void> {
    this.isHost = true;
    this.showScreen('create-room-screen');
  }

  private showJoinRoom(): void {
    this.isHost = false;
    this.showScreen('join-room-screen');
  }

  private async selectVideo(mode: 'host' | 'guest'): Promise<void> {
    try {
      const filePath = await window.electronAPI.selectVideoFile();
      if (!filePath) return;

      this.selectedVideoPath = filePath;

      // Display selected file
      const displayElement = document.getElementById(
        mode === 'host' ? 'video-selected' : 'join-video-selected'
      );
      if (displayElement) {
        displayElement.textContent = `Selected: ${filePath.split('/').pop()}`;
        displayElement.style.color = '#44ff44';
      }

      // If host, create room
      if (mode === 'host') {
        await this.createRoom();
      }
    } catch (error) {
      this.showError(`Error selecting video: ${error}`);
    }
  }

  private async createRoom(): Promise<void> {
    try {
      this.connection = new P2PConnection(true);
      this.connection.onStatusChange((status) =>
        this.handleConnectionStatus(status)
      );

      const roomCode = await this.connection.initAsHost();

      // Display room code
      const roomCodeElement = document.getElementById('room-code');
      if (roomCodeElement) {
        roomCodeElement.textContent = roomCode;
      }

      // Get and display signal
      const signal = await this.connection.getSignalData();
      const signalOutput = document.getElementById(
        'host-signal-output'
      ) as HTMLTextAreaElement;
      if (signalOutput) {
        signalOutput.value = signal;
      }

      // Show room code section
      document.getElementById('room-code-section')!.style.display = 'block';
    } catch (error) {
      this.showError(`Error creating room: ${error}`);
    }
  }

  private async connectGuest(): Promise<void> {
    try {
      const guestSignalInput = document.getElementById(
        'guest-signal-input'
      ) as HTMLTextAreaElement;
      const guestSignal = guestSignalInput.value.trim();

      if (!guestSignal) {
        this.showError('Please paste the guest signal data');
        return;
      }

      if (!this.connection) {
        this.showError('Connection not initialized');
        return;
      }

      await this.connection.connectWithGuest(guestSignal);

      // Show waiting section
      document.getElementById('waiting-section')!.style.display = 'block';
      document.getElementById('room-code-section')!.style.display = 'none';

      // Update connected count
      const connectedCount = document.getElementById('connected-count');
      if (connectedCount) {
        connectedCount.textContent = '1';
      }
    } catch (error) {
      this.showError(`Error connecting guest: ${error}`);
    }
  }

  private async joinRoom(): Promise<void> {
    try {
      const roomCodeInput = document.getElementById(
        'room-code-input'
      ) as HTMLInputElement;
      const roomCode = roomCodeInput.value.trim().toUpperCase();

      if (!roomCode || roomCode.length !== 6) {
        this.showError('Please enter a valid 6-character room code');
        return;
      }

      if (!this.selectedVideoPath) {
        this.showError('Please select a video file first');
        return;
      }

      const hostSignalInput = document.getElementById(
        'host-signal-input'
      ) as HTMLTextAreaElement;
      const hostSignal = hostSignalInput.value.trim();

      if (!hostSignal) {
        this.showError('Please paste the host signal data');
        return;
      }

      // Create connection
      this.connection = new P2PConnection(false);
      this.connection.onStatusChange((status) =>
        this.handleConnectionStatus(status)
      );

      // Join room
      await this.connection.joinRoom(roomCode, hostSignal);

      // Get guest signal
      const guestSignal = await this.connection.getSignalData();
      const guestSignalOutput = document.getElementById(
        'guest-signal-output'
      ) as HTMLTextAreaElement;
      if (guestSignalOutput) {
        guestSignalOutput.value = guestSignal;
      }

      const statusElement = document.getElementById('join-status');
      if (statusElement) {
        statusElement.textContent = 'Connected! Copy your signal and send it to the host, then start watching.';
        statusElement.style.color = '#44ff44';
      }

      // Auto start watching after connection
      setTimeout(() => {
        this.startWatching();
      }, 2000);
    } catch (error) {
      this.showError(`Error joining room: ${error}`);
    }
  }

  private async startWatching(): Promise<void> {
    if (!this.selectedVideoPath) {
      this.showError('No video file selected');
      return;
    }

    if (!this.connection || !this.connection.isConnected()) {
      this.showError('Not connected to peer');
      return;
    }

    try {
      // Show player screen
      this.showScreen('player-screen');

      // Setup video player
      const videoPlayer = document.getElementById(
        'video-player'
      ) as HTMLVideoElement;
      if (!videoPlayer) {
        throw new Error('Video player element not found');
      }

      // Load video
      videoPlayer.src = `file://${this.selectedVideoPath}`;

      // Wait for metadata
      await new Promise((resolve, reject) => {
        videoPlayer.onloadedmetadata = resolve;
        videoPlayer.onerror = reject;
      });

      this.videoDuration = videoPlayer.duration;

      // Initialize sync manager
      this.syncManager = new SyncManager(this.connection, this.isHost);
      this.syncManager.setVideoElement(videoPlayer);

      // Setup player UI updates
      videoPlayer.addEventListener('timeupdate', () => this.updateTimeDisplay());

      // Display room code if host
      if (this.isHost) {
        const roomCodeDisplay = document.getElementById('room-code-display');
        if (roomCodeDisplay && this.connection) {
          roomCodeDisplay.textContent = `Room: ${this.connection.getRoomCode()}`;
        }
      }

      // Notify ready
      if (this.syncManager) {
        this.syncManager.notifyReady(this.userId);
      }
    } catch (error) {
      this.showError(`Error starting playback: ${error}`);
    }
  }

  private togglePlayPause(): void {
    const videoPlayer = document.getElementById(
      'video-player'
    ) as HTMLVideoElement;
    const playPauseBtn = document.getElementById('play-pause-btn');

    if (!videoPlayer || !playPauseBtn) return;

    if (videoPlayer.paused) {
      videoPlayer.play();
      playPauseBtn.textContent = '⏸';
    } else {
      videoPlayer.pause();
      playPauseBtn.textContent = '▶';
    }
  }

  private handleSeekBarInput(): void {
    // Update time display while dragging
    const seekBar = document.getElementById('seek-bar') as HTMLInputElement;
    const videoPlayer = document.getElementById(
      'video-player'
    ) as HTMLVideoElement;

    if (!seekBar || !videoPlayer) return;

    const time = (parseFloat(seekBar.value) / 100) * this.videoDuration;
    videoPlayer.currentTime = time;
  }

  private handleSeek(): void {
    // Actual seek is handled by the input event
    // This is called on mouseup
  }

  private updateTimeDisplay(): void {
    const videoPlayer = document.getElementById(
      'video-player'
    ) as HTMLVideoElement;
    const seekBar = document.getElementById('seek-bar') as HTMLInputElement;
    const timeDisplay = document.getElementById('time-display');

    if (!videoPlayer || !seekBar || !timeDisplay) return;

    const currentTime = videoPlayer.currentTime;
    const duration = this.videoDuration;

    // Update seek bar
    seekBar.value = ((currentTime / duration) * 100).toString();

    // Update time display
    timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private toggleFullscreen(): void {
    const playerContainer = document.querySelector('.player-container');
    if (!playerContainer) return;

    if (!document.fullscreenElement) {
      playerContainer.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  private handleConnectionStatus(status: ConnectionStatus): void {
    const statusDot = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-text');

    if (!statusDot || !statusText) return;

    switch (status) {
      case 'connected':
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
        break;
      case 'connecting':
        statusDot.classList.remove('connected');
        statusText.textContent = 'Connecting...';
        break;
      case 'disconnected':
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        break;
      case 'error':
        statusDot.classList.remove('connected');
        statusText.textContent = 'Connection Error';
        break;
    }
  }

  private copyRoomCode(): void {
    const roomCode = document.getElementById('room-code')?.textContent;
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      this.showSuccess('Room code copied!');
    }
  }

  private copyHostSignal(): void {
    const signalOutput = document.getElementById(
      'host-signal-output'
    ) as HTMLTextAreaElement;
    if (signalOutput && signalOutput.value) {
      navigator.clipboard.writeText(signalOutput.value);
      this.showSuccess('Signal copied!');
    }
  }

  private copyGuestSignal(): void {
    const signalOutput = document.getElementById(
      'guest-signal-output'
    ) as HTMLTextAreaElement;
    if (signalOutput && signalOutput.value) {
      navigator.clipboard.writeText(signalOutput.value);
      this.showSuccess('Signal copied!');
    }
  }

  private exitPlayer(): void {
    this.cleanup();
    this.showHome();
  }

  private cleanup(): void {
    if (this.syncManager) {
      this.syncManager.cleanup();
      this.syncManager = null;
    }

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }

    const videoPlayer = document.getElementById(
      'video-player'
    ) as HTMLVideoElement;
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.src = '';
    }

    this.selectedVideoPath = null;
    this.videoDuration = 0;
  }

  private showError(message: string): void {
    const modal = document.getElementById('error-modal');
    const errorMessage = document.getElementById('error-message');

    if (modal && errorMessage) {
      errorMessage.textContent = message;
      modal.classList.add('active');
    }

    console.error(message);
  }

  private hideError(): void {
    const modal = document.getElementById('error-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  private showSuccess(message: string): void {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #44ff44;
      color: #000;
      padding: 1rem 2rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 10000;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2000);
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LocalWatchApp();
  });
} else {
  new LocalWatchApp();
}
