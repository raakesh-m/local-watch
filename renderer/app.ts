/**
 * LocalWatch 2.0 - Main Application
 * A modern P2P video synchronization app with torrent streaming
 */

import { MeshNetwork, NetworkStatus, ChatMessage, Peer, MediaSource, MediaSourceType } from '../src/p2p/meshNetwork';
import { SyncManager, BufferingInfo } from '../src/sync/syncManager';
import { MediaController, MediaState, FileUploadStatus, VoteRequest } from '../src/sync/mediaController';
import {
  generateNickname,
  getAvatarColor,
  getInitials,
  getSavedUsername,
  saveUsername,
  hasSavedUsername,
  validateName
} from '../src/utils/names';
import { TorrentManager, TorrentProgress, TorrentFileInfo, formatSize, formatSpeed } from '../src/torrent/torrentManager';

// ===== Types =====
interface VideoFile {
  path: string;
  name: string;
  size: number;
  formattedSize: string;
}

interface TorrentMedia {
  magnetUri: string;
  fileName?: string;
  fileSize?: number;
  fileIndex?: number;
}

type MediaSourceMode = 'local' | 'torrent';
type Screen = 'home' | 'create-room' | 'join-room' | 'player';

// ===== Main Application Class =====
class LocalWatchApp {
  // State
  private currentScreen: Screen = 'home';
  private network: MeshNetwork | null = null;
  private syncManager: SyncManager | null = null;
  private mediaController: MediaController | null = null;
  private selectedVideo: VideoFile | null = null;
  private nickname: string = '';
  private videoDuration: number = 0;
  private isFullscreen: boolean = false;
  private isChatOpen: boolean = false;
  private unreadMessages: number = 0;
  private overlayTimeout: NodeJS.Timeout | null = null;
  private chatMessages: ChatMessage[] = [];

  // Torrent state
  private torrentManager: TorrentManager | null = null;
  private torrentMedia: TorrentMedia | null = null;
  private mediaSourceMode: MediaSourceMode = 'local';
  private isTorrentMode: boolean = false;
  private bufferingPeers: Map<string, string> = new Map(); // peerId -> nickname

  // DOM Elements cache
  private elements: Record<string, HTMLElement | null> = {};

  constructor() {
    // Check for saved username or generate random
    const savedName = getSavedUsername();
    this.nickname = savedName || generateNickname();

    this.cacheElements();
    this.initializeEventListeners();
    this.initializeKeyboardShortcuts();
    this.setupFullscreenListener();

    // Show name modal if no saved username
    if (!hasSavedUsername()) {
      this.showNameModal();
    }
  }

  // ===== Initialization =====
  private cacheElements(): void {
    const ids = [
      // Screens
      'home-screen', 'create-room-screen', 'join-room-screen', 'player-screen',
      // Home
      'create-room-btn', 'join-room-btn',
      // Name Modal
      'name-modal', 'setup-name-input', 'name-validation-error', 'save-name-btn',
      // Create Room
      'create-back-btn', 'create-nickname-input', 'random-nickname-btn',
      'select-video-btn', 'video-info', 'video-name', 'video-size', 'remove-video-btn',
      'create-step-3', 'create-step-4', 'room-code', 'copy-code-btn',
      'host-signal-output', 'copy-signal-btn', 'guest-signal-input', 'connect-guest-btn',
      'participants-list', 'generate-new-signal-btn', 'new-signal-container',
      'new-host-signal', 'copy-new-signal-btn', 'new-guest-signal-input', 'connect-new-guest-btn',
      'start-watching-btn',
      // Media Source Tabs
      'tab-local-file', 'tab-torrent', 'panel-local-file', 'panel-torrent',
      'magnet-link-input', 'load-magnet-btn', 'select-torrent-btn',
      'torrent-info', 'torrent-name', 'torrent-size', 'remove-torrent-btn',
      // Join Room
      'join-back-btn', 'join-nickname-input', 'join-random-nickname-btn',
      'room-code-input', 'join-select-video-btn', 'join-video-info',
      'join-video-name', 'join-video-size', 'host-signal-input',
      'guest-signal-section', 'guest-signal-output', 'copy-guest-signal-btn',
      'join-room-connect-btn', 'join-status',
      // Player
      'video-container', 'video-player', 'video-overlay',
      'exit-player-btn', 'room-code-display', 'connection-indicator',
      'chat-toggle-btn', 'chat-badge', 'center-play-btn',
      'progress-bar', 'progress-buffered', 'progress-played', 'progress-handle', 'time-tooltip',
      'play-pause-btn', 'backward-btn', 'forward-btn',
      'mute-btn', 'volume-slider', 'time-display',
      'speed-btn', 'speed-display', 'speed-menu',
      'pip-btn', 'fullscreen-btn',
      'buffering-indicator', 'buffering-text', 'buffering-user-text',
      'chat-panel', 'close-chat-btn', 'participant-count',
      'chat-messages', 'chat-input', 'send-chat-btn',
      'sync-status',
      // Torrent Progress Indicator
      'torrent-progress-indicator', 'torrent-progress-percent', 'torrent-progress-details',
      'torrent-downloaded', 'torrent-speed', 'torrent-peers', 'torrent-progress-fill',
      // Torrent File Picker Modal
      'torrent-file-modal', 'torrent-file-backdrop', 'torrent-file-close-btn', 'torrent-file-list',
      // Waiting for Files Modal
      'waiting-files-modal', 'waiting-files-message', 'required-filename', 'required-filesize', 'user-status-list',
      // Voting Modal
      'voting-modal', 'vote-requester', 'vote-filename', 'vote-filesize', 'vote-type',
      'vote-bar-yes', 'vote-bar-no', 'vote-count-yes', 'vote-count-no', 'vote-timer',
      'vote-accept-btn', 'vote-reject-btn',
      // Modals
      'toast-container', 'modal', 'modal-backdrop', 'modal-title',
      'modal-body', 'modal-footer', 'modal-close-btn',
    ];

    ids.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  }

  private initializeEventListeners(): void {
    // Home Screen
    this.on('create-room-btn', 'click', () => this.showScreen('create-room'));
    this.on('join-room-btn', 'click', () => this.showScreen('join-room'));

    // Name Modal
    this.on('save-name-btn', 'click', () => this.saveNameFromModal());
    const nameInput = this.elements['setup-name-input'] as HTMLInputElement;
    if (nameInput) {
      nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.saveNameFromModal();
      });
    }

    // Create Room Screen
    this.on('create-back-btn', 'click', () => this.showHome());
    this.on('random-nickname-btn', 'click', () => this.generateRandomNickname('create'));
    this.on('select-video-btn', 'click', () => this.selectVideo('create'));
    this.on('remove-video-btn', 'click', () => this.removeVideo('create'));
    this.on('copy-code-btn', 'click', () => this.copyRoomCode());
    this.on('copy-signal-btn', 'click', () => this.copySignal('host-signal-output'));
    this.on('connect-guest-btn', 'click', () => this.connectGuest());
    this.on('generate-new-signal-btn', 'click', () => this.generateNewSignal());
    this.on('copy-new-signal-btn', 'click', () => this.copySignal('new-host-signal'));
    this.on('connect-new-guest-btn', 'click', () => this.connectNewGuest());
    this.on('start-watching-btn', 'click', () => this.initiateWatching());

    // Media Source Tabs
    this.on('tab-local-file', 'click', () => this.switchMediaSourceTab('local'));
    this.on('tab-torrent', 'click', () => this.switchMediaSourceTab('torrent'));

    // Torrent Input
    this.on('load-magnet-btn', 'click', () => this.loadMagnetLink());
    this.on('select-torrent-btn', 'click', () => this.selectTorrentFile());
    this.on('remove-torrent-btn', 'click', () => this.removeTorrent());

    // Torrent Progress Indicator hover
    const torrentProgressMini = this.elements['torrent-progress-indicator'];
    if (torrentProgressMini) {
      torrentProgressMini.addEventListener('mouseenter', () => {
        this.elements['torrent-progress-details']?.classList.remove('hidden');
      });
      torrentProgressMini.addEventListener('mouseleave', () => {
        this.elements['torrent-progress-details']?.classList.add('hidden');
      });
    }

    // Torrent File Picker Modal
    this.on('torrent-file-close-btn', 'click', () => this.closeTorrentFileModal());
    this.on('torrent-file-backdrop', 'click', () => this.closeTorrentFileModal());

    // Voting Modal
    this.on('vote-accept-btn', 'click', () => this.handleVote(true));
    this.on('vote-reject-btn', 'click', () => this.handleVote(false));

    // Join Room Screen
    this.on('join-back-btn', 'click', () => this.showHome());
    this.on('join-random-nickname-btn', 'click', () => this.generateRandomNickname('join'));
    this.on('join-select-video-btn', 'click', () => this.selectVideo('join'));
    this.on('copy-guest-signal-btn', 'click', () => this.copySignal('guest-signal-output'));
    this.on('join-room-connect-btn', 'click', () => this.joinRoom());

    // Room code input auto-uppercase
    const roomCodeInput = this.elements['room-code-input'] as HTMLInputElement;
    if (roomCodeInput) {
      roomCodeInput.addEventListener('input', () => {
        roomCodeInput.value = roomCodeInput.value.toUpperCase();
      });
    }

    // Player Screen
    this.on('exit-player-btn', 'click', () => this.exitPlayer());
    this.on('center-play-btn', 'click', () => this.togglePlayPause());
    this.on('play-pause-btn', 'click', () => this.togglePlayPause());
    this.on('backward-btn', 'click', () => this.seek(-10));
    this.on('forward-btn', 'click', () => this.seek(10));
    this.on('mute-btn', 'click', () => this.toggleMute());
    this.on('fullscreen-btn', 'click', () => this.toggleFullscreen());
    this.on('pip-btn', 'click', () => this.togglePiP());
    this.on('speed-btn', 'click', () => this.toggleSpeedMenu());
    this.on('chat-toggle-btn', 'click', () => this.toggleChat());
    this.on('close-chat-btn', 'click', () => this.toggleChat());
    this.on('send-chat-btn', 'click', () => this.sendChatMessage());

    // Volume slider
    const volumeSlider = this.elements['volume-slider'] as HTMLInputElement;
    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => this.handleVolumeChange());
    }

    // Progress bar
    const progressBar = this.elements['progress-bar'];
    if (progressBar) {
      progressBar.addEventListener('click', (e) => this.handleProgressClick(e));
      progressBar.addEventListener('mousemove', (e) => this.handleProgressHover(e));
    }

    // Speed menu buttons
    const speedMenu = this.elements['speed-menu'];
    if (speedMenu) {
      speedMenu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const speed = parseFloat(btn.dataset.speed || '1');
          this.setPlaybackSpeed(speed);
        });
      });
    }

    // Chat input
    const chatInput = this.elements['chat-input'] as HTMLInputElement;
    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage();
        }
      });
    }

    // Video overlay show/hide
    const videoContainer = this.elements['video-container'];
    if (videoContainer) {
      videoContainer.addEventListener('mousemove', () => this.showOverlay());
      videoContainer.addEventListener('mouseleave', () => this.hideOverlay());
    }

    // Double click for fullscreen
    const videoPlayer = this.elements['video-player'];
    if (videoPlayer) {
      videoPlayer.addEventListener('dblclick', () => this.toggleFullscreen());
    }

    // Modal close
    this.on('modal-backdrop', 'click', () => this.hideModal());
    this.on('modal-close-btn', 'click', () => this.hideModal());
  }

  private initializeKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts in player screen
      if (this.currentScreen !== 'player') return;

      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          this.togglePlayPause();
          break;
        case 'arrowleft':
          e.preventDefault();
          this.seek(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          this.seek(10);
          break;
        case 'arrowup':
          e.preventDefault();
          this.adjustVolume(0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          this.adjustVolume(-0.1);
          break;
        case 'f':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'p':
          e.preventDefault();
          this.togglePiP();
          break;
        case 'escape':
          if (this.isFullscreen) {
            this.toggleFullscreen();
          }
          break;
      }
    });
  }

  private setupFullscreenListener(): void {
    window.electronAPI.onFullscreenChange((isFullscreen) => {
      this.isFullscreen = isFullscreen;
      this.updateFullscreenButton();
    });
  }

  // ===== Utility Methods =====
  private on(elementId: string, event: string, handler: (e: Event) => void): void {
    const element = this.elements[elementId];
    if (element) {
      element.addEventListener(event, handler);
    }
  }

  private showScreen(screen: Screen): void {
    // Hide all screens
    ['home-screen', 'create-room-screen', 'join-room-screen', 'player-screen'].forEach(id => {
      this.elements[id]?.classList.remove('active');
    });

    // Show target screen
    this.elements[`${screen}-screen`]?.classList.add('active');
    this.currentScreen = screen;

    // Set initial nickname if empty
    if (screen === 'create-room') {
      const input = this.elements['create-nickname-input'] as HTMLInputElement;
      if (input && !input.value) {
        input.value = this.nickname;
      }
    } else if (screen === 'join-room') {
      const input = this.elements['join-nickname-input'] as HTMLInputElement;
      if (input && !input.value) {
        input.value = this.nickname;
      }
    }
  }

  private showHome(): void {
    this.cleanup();
    this.showScreen('home');
    this.resetForms();
  }

  private resetForms(): void {
    // Reset create room
    this.selectedVideo = null;
    this.elements['video-info']?.classList.add('hidden');
    this.elements['create-step-3']?.classList.add('hidden');
    this.elements['create-step-4']?.classList.add('hidden');
    this.elements['new-signal-container']?.classList.add('hidden');

    const createNickname = this.elements['create-nickname-input'] as HTMLInputElement;
    if (createNickname) createNickname.value = '';

    const hostSignal = this.elements['host-signal-output'] as HTMLTextAreaElement;
    if (hostSignal) hostSignal.value = '';

    const guestSignal = this.elements['guest-signal-input'] as HTMLTextAreaElement;
    if (guestSignal) guestSignal.value = '';

    // Reset join room
    this.elements['join-video-info']?.classList.add('hidden');
    this.elements['guest-signal-section']?.classList.add('hidden');

    const joinNickname = this.elements['join-nickname-input'] as HTMLInputElement;
    if (joinNickname) joinNickname.value = '';

    const roomCode = this.elements['room-code-input'] as HTMLInputElement;
    if (roomCode) roomCode.value = '';

    const hostSignalInput = this.elements['host-signal-input'] as HTMLTextAreaElement;
    if (hostSignalInput) hostSignalInput.value = '';

    const guestSignalOutput = this.elements['guest-signal-output'] as HTMLTextAreaElement;
    if (guestSignalOutput) guestSignalOutput.value = '';

    const joinStatus = this.elements['join-status'];
    if (joinStatus) {
      joinStatus.textContent = '';
      joinStatus.className = 'status-message';
    }
  }

  // ===== Nickname =====
  private generateRandomNickname(mode: 'create' | 'join'): void {
    const newNickname = generateNickname();
    this.nickname = newNickname;

    const inputId = mode === 'create' ? 'create-nickname-input' : 'join-nickname-input';
    const input = this.elements[inputId] as HTMLInputElement;
    if (input) {
      input.value = newNickname;
    }
  }

  private getNickname(mode: 'create' | 'join'): string {
    const inputId = mode === 'create' ? 'create-nickname-input' : 'join-nickname-input';
    const input = this.elements[inputId] as HTMLInputElement;
    return input?.value.trim() || this.nickname;
  }

  // ===== Video Selection =====
  private async selectVideo(mode: 'create' | 'join'): Promise<void> {
    try {
      const result = await window.electronAPI.selectVideoFile();
      if (!result) return;

      this.selectedVideo = result;

      // Update UI
      const infoId = mode === 'create' ? 'video-info' : 'join-video-info';
      const nameId = mode === 'create' ? 'video-name' : 'join-video-name';
      const sizeId = mode === 'create' ? 'video-size' : 'join-video-size';

      this.elements[infoId]?.classList.remove('hidden');
      const nameEl = this.elements[nameId];
      const sizeEl = this.elements[sizeId];
      if (nameEl) nameEl.textContent = result.name;
      if (sizeEl) sizeEl.textContent = result.formattedSize;

      // If creating room, initialize network
      if (mode === 'create') {
        await this.createRoom();
      }

      this.showToast(`Video selected: ${result.name}`, 'success');
    } catch (error) {
      this.showToast(`Error selecting video: ${error}`, 'error');
    }
  }

  private removeVideo(mode: 'create' | 'join'): void {
    this.selectedVideo = null;
    const infoId = mode === 'create' ? 'video-info' : 'join-video-info';
    this.elements[infoId]?.classList.add('hidden');
  }

  // ===== Room Creation =====
  private async createRoom(): Promise<void> {
    try {
      const nickname = this.getNickname('create');
      this.network = new MeshNetwork(nickname);
      this.setupNetworkCallbacks();

      // Initialize MediaController
      this.mediaController = new MediaController(this.network);
      this.setupMediaControllerCallbacks();

      const { roomCode, signalData } = await this.network.createRoom();

      // Update UI
      const roomCodeEl = this.elements['room-code'];
      if (roomCodeEl) roomCodeEl.textContent = roomCode;

      const signalEl = this.elements['host-signal-output'] as HTMLTextAreaElement;
      if (signalEl) signalEl.value = signalData;

      // Show step 3
      this.elements['create-step-3']?.classList.remove('hidden');

      // Update participants list with self
      this.updateParticipantsList();

      this.showToast('Room created! Share the code with friends', 'success');
    } catch (error) {
      this.showToast(`Error creating room: ${error}`, 'error');
    }
  }

  private async connectGuest(): Promise<void> {
    const guestSignal = (this.elements['guest-signal-input'] as HTMLTextAreaElement)?.value.trim();

    if (!guestSignal) {
      this.showToast('Please paste your friend\'s signal', 'warning');
      return;
    }

    if (!this.network) {
      this.showToast('Room not initialized', 'error');
      return;
    }

    try {
      await this.network.connectWithGuestSignal(guestSignal);

      // Show step 4 (waiting room)
      this.elements['create-step-3']?.classList.add('hidden');
      this.elements['create-step-4']?.classList.remove('hidden');

      this.showToast('Friend connected!', 'success');
    } catch (error) {
      this.showToast(`Connection failed: ${error}`, 'error');
    }
  }

  private async generateNewSignal(): Promise<void> {
    if (!this.network) return;

    try {
      const signal = await this.network.generateSignalForNewGuest();

      const signalEl = this.elements['new-host-signal'] as HTMLTextAreaElement;
      if (signalEl) signalEl.value = signal;

      this.elements['new-signal-container']?.classList.remove('hidden');
    } catch (error) {
      this.showToast(`Error generating signal: ${error}`, 'error');
    }
  }

  private async connectNewGuest(): Promise<void> {
    const guestSignal = (this.elements['new-guest-signal-input'] as HTMLTextAreaElement)?.value.trim();

    if (!guestSignal || !this.network) {
      this.showToast('Please paste the signal', 'warning');
      return;
    }

    try {
      await this.network.connectWithGuestSignal(guestSignal);
      this.elements['new-signal-container']?.classList.add('hidden');

      // Clear inputs
      const newSignalEl = this.elements['new-host-signal'] as HTMLTextAreaElement;
      if (newSignalEl) newSignalEl.value = '';
      const newGuestEl = this.elements['new-guest-signal-input'] as HTMLTextAreaElement;
      if (newGuestEl) newGuestEl.value = '';

      this.showToast('Friend connected!', 'success');
    } catch (error) {
      this.showToast(`Connection failed: ${error}`, 'error');
    }
  }

  // ===== Room Joining =====
  private async joinRoom(): Promise<void> {
    const roomCode = (this.elements['room-code-input'] as HTMLInputElement)?.value.trim().toUpperCase();
    const hostSignal = (this.elements['host-signal-input'] as HTMLTextAreaElement)?.value.trim();

    if (!roomCode || roomCode.length !== 6) {
      this.showToast('Please enter a valid 6-character room code', 'warning');
      return;
    }

    if (!this.selectedVideo) {
      this.showToast('Please select a video file', 'warning');
      return;
    }

    if (!hostSignal) {
      this.showToast('Please paste the host\'s signal', 'warning');
      return;
    }

    try {
      const nickname = this.getNickname('join');
      this.network = new MeshNetwork(nickname);
      this.setupNetworkCallbacks();

      // Initialize MediaController
      this.mediaController = new MediaController(this.network);
      this.setupMediaControllerCallbacks();

      const guestSignal = await this.network.joinRoom(roomCode, hostSignal);

      // Show guest signal
      this.elements['guest-signal-section']?.classList.remove('hidden');
      const signalEl = this.elements['guest-signal-output'] as HTMLTextAreaElement;
      if (signalEl) signalEl.value = guestSignal;

      // Update status
      const statusEl = this.elements['join-status'];
      if (statusEl) {
        statusEl.textContent = 'Connected! Copy your signal and send it to the host, then wait...';
        statusEl.className = 'status-message success';
      }

      this.showToast('Connected to room! Send your signal to the host', 'success');

      // Auto-start watching after short delay (host needs to connect back)
      setTimeout(() => {
        if (this.network && this.network.getConnectedPeerCount() > 0) {
          this.startWatching();
        }
      }, 3000);
    } catch (error) {
      this.showToast(`Connection failed: ${error}`, 'error');

      const statusEl = this.elements['join-status'];
      if (statusEl) {
        statusEl.textContent = `Connection failed: ${error}`;
        statusEl.className = 'status-message error';
      }
    }
  }

  // ===== Network Callbacks =====
  private setupNetworkCallbacks(): void {
    if (!this.network) return;

    this.network.onStatusChange((status) => {
      this.handleNetworkStatus(status);
    });

    this.network.onPeerJoin((peerId, nickname) => {
      this.showToast(`${nickname} joined`, 'success');
      this.updateParticipantsList();
      this.updateParticipantCount();
    });

    this.network.onPeerLeave((peerId, nickname) => {
      this.showToast(`${nickname} left`, 'warning');
      this.updateParticipantsList();
      this.updateParticipantCount();
    });

    this.network.onChatMessage((message) => {
      this.handleChatMessage(message);
    });

    this.network.onLeaderChange((leaderId) => {
      const isMe = leaderId === this.network?.getLocalId();
      if (isMe && this.syncManager) {
        this.showToast('You are now the sync leader', 'success');
      }
    });
  }

  /**
   * Setup MediaController callbacks
   */
  private setupMediaControllerCallbacks(): void {
    if (!this.mediaController) return;

    // When all files are ready and media can start
    this.mediaController.onMediaReady(() => {
      this.hideWaitingForFilesModal();
      // Don't call startWatching() here - it will be called after coordination is complete
    });

    // When waiting for peers to upload files
    this.mediaController.onWaitingForFiles((statuses: FileUploadStatus[]) => {
      this.showWaitingForFilesModal(statuses);
    });

    // When a vote request is received
    this.mediaController.onVoteRequest((request: VoteRequest) => {
      this.showVotingModal(request);
    });

    // When vote count changes
    this.mediaController.onVoteUpdate((yesCount: number, noCount: number, total: number) => {
      this.updateVoteCount(yesCount, noCount, total);
    });

    // When vote is finalized
    this.mediaController.onVoteResult((accepted: boolean) => {
      this.hideVotingModal();
      if (accepted) {
        this.showToast('Media change accepted', 'success');
        // Media will be updated via onMediaChange
      } else {
        this.showToast('Media change rejected', 'info');
      }
    });

    // When media changes
    this.mediaController.onMediaChange((oldMedia: MediaState | null, newMedia: MediaState) => {
      this.handleMediaChange(oldMedia, newMedia);
    });
  }

  private handleNetworkStatus(status: NetworkStatus): void {
    const indicator = this.elements['connection-indicator'];
    if (!indicator) return;

    indicator.className = 'connection-badge';
    const statusText = indicator.querySelector('.status-text');

    switch (status) {
      case 'connected':
        statusText!.textContent = 'Connected';
        break;
      case 'connecting':
        indicator.classList.add('reconnecting');
        statusText!.textContent = 'Connecting...';
        break;
      case 'reconnecting':
        indicator.classList.add('reconnecting');
        statusText!.textContent = 'Reconnecting...';
        break;
      case 'disconnected':
        indicator.classList.add('disconnected');
        statusText!.textContent = 'Disconnected';
        break;
      case 'error':
        indicator.classList.add('disconnected');
        statusText!.textContent = 'Error';
        break;
    }
  }

  // ===== Participants =====
  private updateParticipantsList(): void {
    const list = this.elements['participants-list'];
    if (!list || !this.network) return;

    list.innerHTML = '';

    // Add self
    const selfItem = this.createParticipantItem(
      this.network.getLocalNickname(),
      true,
      this.network.isLeader()
    );
    list.appendChild(selfItem);

    // Add peers
    const peers = this.network.getPeers();
    peers.forEach((peer) => {
      const item = this.createParticipantItem(
        peer.nickname,
        false,
        this.network!.getLeaderId() === peer.id,
        peer.status
      );
      list.appendChild(item);
    });
  }

  private createParticipantItem(
    nickname: string,
    isYou: boolean,
    isHost: boolean,
    status: string = 'connected'
  ): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'participant-item';

    const avatar = document.createElement('div');
    avatar.className = 'participant-avatar';
    avatar.style.backgroundColor = getAvatarColor(nickname);
    avatar.textContent = getInitials(nickname);

    const name = document.createElement('span');
    name.className = 'participant-name';
    name.textContent = nickname + (isYou ? ' (You)' : '');

    li.appendChild(avatar);
    li.appendChild(name);

    if (isHost) {
      const badge = document.createElement('span');
      badge.className = 'participant-badge';
      badge.textContent = 'Host';
      li.appendChild(badge);
    }

    const statusDot = document.createElement('span');
    statusDot.className = 'participant-status';
    if (status === 'reconnecting') {
      statusDot.classList.add('reconnecting');
    }
    li.appendChild(statusDot);

    return li;
  }

  private updateParticipantCount(): void {
    const countEl = this.elements['participant-count'];
    if (!countEl || !this.network) return;

    const count = this.network.getConnectedPeerCount() + 1; // +1 for self
    countEl.textContent = `${count} watching`;
  }

  // ===== Media Initiation and Coordination =====
  /**
   * Initiate watching - loads media via MediaController for coordination
   */
  private async initiateWatching(): Promise<void> {
    if (!this.mediaController) {
      this.showToast('Media controller not initialized', 'error');
      return;
    }

    const hasTorrent = this.mediaSourceMode === 'torrent' && this.torrentMedia !== null;
    const hasLocal = this.mediaSourceMode === 'local' && this.selectedVideo !== null;

    if (!hasTorrent && !hasLocal) {
      this.showToast('No media selected', 'error');
      return;
    }

    try {
      if (hasTorrent && this.torrentMedia) {
        // Load torrent via MediaController
        this.mediaController.loadTorrent(
          this.torrentMedia.magnetUri,
          this.torrentMedia.fileName || 'video',
          this.torrentMedia.fileSize || 0,
          this.torrentMedia.fileIndex
        );
        // Torrent is ready immediately, proceed to start watching
        await this.startWatching();
      } else if (hasLocal && this.selectedVideo) {
        // Load local file via MediaController - this initiates coordination
        this.mediaController.loadLocalFile(
          this.selectedVideo.name,
          this.selectedVideo.size
        );
        // Confirm that we (the current user) have uploaded this file
        const confirmed = this.mediaController.confirmLocalFileUploaded(
          this.selectedVideo.name,
          this.selectedVideo.size
        );
        if (!confirmed) {
          this.showToast('File verification failed', 'error');
          return;
        }
        // Wait for all users to be ready - modal will be shown by MediaController callback
        // When ready, onMediaReady callback will be triggered
        // We need to poll or wait for all files to be ready
        const checkReady = setInterval(() => {
          if (this.mediaController?.areAllFilesReady()) {
            clearInterval(checkReady);
            this.hideWaitingForFilesModal();
            this.startWatching();
          }
        }, 500);
      }
    } catch (error: any) {
      console.error('Error initiating watching:', error);
      this.showToast(`Error: ${error.message}`, 'error');
    }
  }

  // ===== Start Watching =====
  private async startWatching(): Promise<void> {
    // Check if we have media source (local or torrent)
    const hasTorrent = this.mediaSourceMode === 'torrent' && this.torrentMedia !== null;
    const hasLocal = this.mediaSourceMode === 'local' && this.selectedVideo !== null;

    if (!hasTorrent && !hasLocal) {
      this.showToast('No media selected', 'error');
      return;
    }

    if (!this.network) {
      this.showToast('Not connected to room', 'error');
      return;
    }

    try {
      this.showScreen('player');
      this.isTorrentMode = hasTorrent;

      const videoPlayer = this.elements['video-player'] as HTMLVideoElement;
      if (!videoPlayer) throw new Error('Video player not found');

      // Initialize sync manager first
      this.syncManager = new SyncManager(this.network);

      // Setup buffering callback with user info
      this.syncManager.onBufferingChange((info) => {
        this.handleBufferingInfo(info);
      });

      // Setup media source callback for when peers share torrents
      this.syncManager.onMediaSource((source) => {
        this.handleReceivedMediaSource(source);
      });

      if (hasTorrent) {
        // Torrent mode - stream from torrent
        await this.startTorrentStream();

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout loading torrent stream')), 60000);
          videoPlayer.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          videoPlayer.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load torrent stream'));
          };
        });

        // Broadcast torrent to all peers
        this.broadcastMediaSource();
      } else {
        // Local file mode
        videoPlayer.src = `file://${this.selectedVideo!.path}`;

        // Wait for metadata
        await new Promise<void>((resolve, reject) => {
          videoPlayer.onloadedmetadata = () => resolve();
          videoPlayer.onerror = () => reject(new Error('Failed to load video'));
        });
      }

      this.videoDuration = videoPlayer.duration;
      this.syncManager.setVideoElement(videoPlayer);

      // Setup video event listeners
      this.setupVideoListeners(videoPlayer);

      // Update room code display
      const roomCodeDisplay = this.elements['room-code-display'];
      if (roomCodeDisplay && this.network.getRoomCode()) {
        roomCodeDisplay.textContent = this.network.getRoomCode()!;
      }

      // Update participants
      this.updateParticipantCount();

      // Notify ready
      this.syncManager.notifyReady();

      this.showToast('Playback started', 'success');
    } catch (error) {
      this.showToast(`Failed to start playback: ${error}`, 'error');
      this.showHome();
    }
  }

  private setupVideoListeners(video: HTMLVideoElement): void {
    video.addEventListener('timeupdate', () => this.updateProgress());
    video.addEventListener('play', () => this.updatePlayPauseButton(false));
    video.addEventListener('pause', () => this.updatePlayPauseButton(true));
    video.addEventListener('waiting', () => {
      this.showBuffering(true);
      // Broadcast local buffering state to peers
      this.broadcastLocalBuffering(true);
    });
    video.addEventListener('playing', () => {
      this.showBuffering(false);
      this.broadcastLocalBuffering(false);
    });
    video.addEventListener('canplay', () => {
      this.showBuffering(false);
      this.broadcastLocalBuffering(false);
    });
    video.addEventListener('progress', () => this.updateBuffered());
    video.addEventListener('volumechange', () => this.updateVolumeUI());
  }

  // ===== Video Controls =====
  private togglePlayPause(): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  private updatePlayPauseButton(isPaused: boolean): void {
    const playIcon = this.elements['play-pause-btn']?.querySelector('.icon-play');
    const pauseIcon = this.elements['play-pause-btn']?.querySelector('.icon-pause');
    const centerBtn = this.elements['center-play-btn'];

    if (isPaused) {
      playIcon?.classList.remove('hidden');
      pauseIcon?.classList.add('hidden');
      centerBtn?.classList.remove('hidden');
    } else {
      playIcon?.classList.add('hidden');
      pauseIcon?.classList.remove('hidden');
      centerBtn?.classList.add('hidden');
    }
  }

  private seek(seconds: number): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (!video) return;

    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, this.videoDuration));
  }

  private handleProgressClick(e: MouseEvent): void {
    const progressBar = this.elements['progress-bar'];
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (!progressBar || !video) return;

    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * this.videoDuration;
  }

  private handleProgressHover(e: MouseEvent): void {
    const progressBar = this.elements['progress-bar'];
    const tooltip = this.elements['time-tooltip'];
    if (!progressBar || !tooltip) return;

    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * this.videoDuration;

    tooltip.textContent = this.formatTime(time);
    tooltip.style.left = `${e.clientX - rect.left}px`;
  }

  private updateProgress(): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    const played = this.elements['progress-played'];
    const handle = this.elements['progress-handle'];
    const timeDisplay = this.elements['time-display'];

    if (!video || !played || !handle || !timeDisplay) return;

    const percent = (video.currentTime / this.videoDuration) * 100;
    played.style.width = `${percent}%`;
    handle.style.left = `${percent}%`;

    timeDisplay.textContent = `${this.formatTime(video.currentTime)} / ${this.formatTime(this.videoDuration)}`;
  }

  private updateBuffered(): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    const buffered = this.elements['progress-buffered'];
    if (!video || !buffered || video.buffered.length === 0) return;

    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    const percent = (bufferedEnd / this.videoDuration) * 100;
    buffered.style.width = `${percent}%`;
  }

  private showBuffering(show: boolean): void {
    const indicator = this.elements['buffering-indicator'];
    if (indicator) {
      indicator.classList.toggle('hidden', !show);
    }
  }

  // ===== Volume =====
  private handleVolumeChange(): void {
    const slider = this.elements['volume-slider'] as HTMLInputElement;
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (!slider || !video) return;

    video.volume = parseInt(slider.value) / 100;
    video.muted = false;
    this.updateVolumeUI();
  }

  private adjustVolume(delta: number): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (!video) return;

    video.volume = Math.max(0, Math.min(1, video.volume + delta));
    video.muted = false;
    this.updateVolumeUI();
  }

  private toggleMute(): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (!video) return;

    video.muted = !video.muted;
    this.updateVolumeUI();
  }

  private updateVolumeUI(): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    const slider = this.elements['volume-slider'] as HTMLInputElement;
    const volumeIcon = this.elements['mute-btn']?.querySelector('.icon-volume');
    const mutedIcon = this.elements['mute-btn']?.querySelector('.icon-muted');

    if (!video || !slider) return;

    slider.value = String(video.muted ? 0 : Math.round(video.volume * 100));

    if (video.muted || video.volume === 0) {
      volumeIcon?.classList.add('hidden');
      mutedIcon?.classList.remove('hidden');
    } else {
      volumeIcon?.classList.remove('hidden');
      mutedIcon?.classList.add('hidden');
    }
  }

  // ===== Playback Speed =====
  private toggleSpeedMenu(): void {
    const menu = this.elements['speed-menu'];
    menu?.classList.toggle('hidden');
  }

  private setPlaybackSpeed(speed: number): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    const speedDisplay = this.elements['speed-display'];
    const menu = this.elements['speed-menu'];

    if (video) video.playbackRate = speed;
    if (speedDisplay) speedDisplay.textContent = `${speed}x`;

    // Update active button
    menu?.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed || '1') === speed);
    });

    menu?.classList.add('hidden');
  }

  // ===== Fullscreen =====
  private async toggleFullscreen(): Promise<void> {
    await window.electronAPI.toggleFullscreen();
  }

  private updateFullscreenButton(): void {
    const expandIcon = this.elements['fullscreen-btn']?.querySelector('.icon-expand');
    const compressIcon = this.elements['fullscreen-btn']?.querySelector('.icon-compress');

    if (this.isFullscreen) {
      expandIcon?.classList.add('hidden');
      compressIcon?.classList.remove('hidden');
    } else {
      expandIcon?.classList.remove('hidden');
      compressIcon?.classList.add('hidden');
    }
  }

  // ===== Picture in Picture =====
  private async togglePiP(): Promise<void> {
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      this.showToast('Picture-in-picture not supported', 'warning');
    }
  }

  // ===== Overlay =====
  private showOverlay(): void {
    const overlay = this.elements['video-overlay'];
    overlay?.classList.add('visible');

    if (this.overlayTimeout) {
      clearTimeout(this.overlayTimeout);
    }

    this.overlayTimeout = setTimeout(() => {
      this.hideOverlay();
    }, 3000);
  }

  private hideOverlay(): void {
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (video?.paused) return; // Don't hide if paused

    const overlay = this.elements['video-overlay'];
    overlay?.classList.remove('visible');
  }

  // ===== Chat =====
  private toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    const panel = this.elements['chat-panel'];
    panel?.classList.toggle('hidden', !this.isChatOpen);

    if (this.isChatOpen) {
      this.unreadMessages = 0;
      this.updateChatBadge();
    }
  }

  private sendChatMessage(): void {
    const input = this.elements['chat-input'] as HTMLInputElement;
    if (!input || !this.network) return;

    const content = input.value.trim();
    if (!content) return;

    this.network.sendChatMessage(content);
    input.value = '';
  }

  private handleChatMessage(message: ChatMessage): void {
    this.chatMessages.push(message);
    this.renderChatMessage(message);

    if (!this.isChatOpen) {
      this.unreadMessages++;
      this.updateChatBadge();
    }
  }

  private renderChatMessage(message: ChatMessage): void {
    const container = this.elements['chat-messages'];
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-message';

    const avatar = document.createElement('div');
    avatar.className = 'chat-message-avatar';
    avatar.style.backgroundColor = getAvatarColor(message.senderNickname);
    avatar.textContent = getInitials(message.senderNickname);

    const content = document.createElement('div');
    content.className = 'chat-message-content';

    const header = document.createElement('div');
    header.className = 'chat-message-header';

    const name = document.createElement('span');
    name.className = 'chat-message-name';
    name.textContent = message.senderNickname;

    const time = document.createElement('span');
    time.className = 'chat-message-time';
    time.textContent = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    header.appendChild(name);
    header.appendChild(time);

    const text = document.createElement('p');
    text.className = 'chat-message-text';
    text.textContent = message.content;

    content.appendChild(header);
    content.appendChild(text);

    div.appendChild(avatar);
    div.appendChild(content);

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  private updateChatBadge(): void {
    const badge = this.elements['chat-badge'];
    if (!badge) return;

    if (this.unreadMessages > 0) {
      badge.textContent = String(this.unreadMessages);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ===== Copy Functions =====
  private copyRoomCode(): void {
    const code = this.elements['room-code']?.textContent;
    if (code) {
      navigator.clipboard.writeText(code);
      this.showToast('Room code copied!', 'success');
    }
  }

  private copySignal(elementId: string): void {
    const textarea = this.elements[elementId] as HTMLTextAreaElement;
    if (textarea?.value) {
      navigator.clipboard.writeText(textarea.value);
      this.showToast('Signal copied!', 'success');
    }
  }

  // ===== Exit Player =====
  private async exitPlayer(): Promise<void> {
    const confirmed = await window.electronAPI.showConfirmDialog({
      title: 'Leave Room',
      message: 'Are you sure you want to leave?',
      detail: 'You will disconnect from all participants.',
      confirmText: 'Leave',
      cancelText: 'Stay',
    });

    if (confirmed) {
      this.showHome();
    }
  }

  // ===== Cleanup =====
  private cleanup(): void {
    // Stop video
    const video = this.elements['video-player'] as HTMLVideoElement;
    if (video) {
      video.pause();
      video.src = '';
    }

    // Cleanup sync manager
    if (this.syncManager) {
      this.syncManager.cleanup();
      this.syncManager = null;
    }

    // Disconnect network
    if (this.network) {
      this.network.disconnect();
      this.network = null;
    }

    // Reset state
    this.selectedVideo = null;
    this.videoDuration = 0;
    this.isChatOpen = false;
    this.unreadMessages = 0;
    this.chatMessages = [];

    // Clear chat
    const chatContainer = this.elements['chat-messages'];
    if (chatContainer) chatContainer.innerHTML = '';

    // Hide chat panel
    this.elements['chat-panel']?.classList.add('hidden');

    // Clear overlay timeout
    if (this.overlayTimeout) {
      clearTimeout(this.overlayTimeout);
      this.overlayTimeout = null;
    }
  }

  // ===== Utilities =====
  private formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ===== Toast Notifications =====
  private showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success'): void {
    const container = this.elements['toast-container'];
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Remove after animation
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // ===== Modal =====
  private showModal(title: string, body: string, buttons?: Array<{ text: string; primary?: boolean; onClick: () => void }>): void {
    const modal = this.elements['modal'];
    const titleEl = this.elements['modal-title'];
    const bodyEl = this.elements['modal-body'];
    const footerEl = this.elements['modal-footer'];

    if (!modal || !titleEl || !bodyEl || !footerEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    footerEl.innerHTML = '';

    if (buttons) {
      buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = `btn ${btn.primary ? 'btn-primary' : 'btn-secondary'}`;
        button.textContent = btn.text;
        button.addEventListener('click', () => {
          btn.onClick();
          this.hideModal();
        });
        footerEl.appendChild(button);
      });
    }

    modal.classList.remove('hidden');
  }

  private hideModal(): void {
    this.elements['modal']?.classList.add('hidden');
  }

  // ===== Name Modal Methods =====
  private showNameModal(): void {
    const modal = this.elements['name-modal'];
    const input = this.elements['setup-name-input'] as HTMLInputElement;
    if (modal) {
      modal.classList.remove('hidden');
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  }

  private hideNameModal(): void {
    this.elements['name-modal']?.classList.add('hidden');
  }

  private saveNameFromModal(): void {
    const input = this.elements['setup-name-input'] as HTMLInputElement;
    const errorEl = this.elements['name-validation-error'];

    if (!input) return;

    const name = input.value.trim();
    const validation = validateName(name);

    if (!validation.valid) {
      if (errorEl) {
        errorEl.textContent = validation.error || 'Invalid name';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    // Save the name
    if (saveUsername(name)) {
      this.nickname = name;
      this.hideNameModal();
      this.showToast('Name saved!', 'success');

      // Update nickname inputs if they exist
      const createInput = this.elements['create-nickname-input'] as HTMLInputElement;
      const joinInput = this.elements['join-nickname-input'] as HTMLInputElement;
      if (createInput) createInput.value = name;
      if (joinInput) joinInput.value = name;
    } else {
      if (errorEl) {
        errorEl.textContent = 'Failed to save name';
        errorEl.classList.remove('hidden');
      }
    }
  }

  // ===== Media Source Tab Methods =====
  private switchMediaSourceTab(mode: MediaSourceMode): void {
    this.mediaSourceMode = mode;

    // Update tab active states
    const localTab = this.elements['tab-local-file'];
    const torrentTab = this.elements['tab-torrent'];
    const localPanel = this.elements['panel-local-file'];
    const torrentPanel = this.elements['panel-torrent'];

    if (mode === 'local') {
      localTab?.classList.add('active');
      torrentTab?.classList.remove('active');
      localPanel?.classList.remove('hidden');
      torrentPanel?.classList.add('hidden');
    } else {
      localTab?.classList.remove('active');
      torrentTab?.classList.add('active');
      localPanel?.classList.add('hidden');
      torrentPanel?.classList.remove('hidden');
    }
  }

  // ===== Torrent Methods =====
  private initTorrentManager(): void {
    if (this.torrentManager) return;

    this.torrentManager = new TorrentManager();

    // Set up callbacks
    this.torrentManager.onProgress((progress) => {
      this.updateTorrentProgressUI(progress);
    });

    this.torrentManager.onReady((file) => {
      console.log('Torrent file ready:', file.name);
      this.torrentMedia = {
        magnetUri: this.torrentManager?.getMagnetURI() || '',
        fileName: file.name,
        fileSize: file.size,
        fileIndex: file.index,
      };

      // Update UI
      const nameEl = this.elements['torrent-name'];
      const sizeEl = this.elements['torrent-size'];
      const infoEl = this.elements['torrent-info'];

      if (nameEl) nameEl.textContent = file.name;
      if (sizeEl) sizeEl.textContent = formatSize(file.size);
      if (infoEl) infoEl.classList.remove('hidden');

      this.showToast('Torrent loaded: ' + file.name, 'success');
    });

    this.torrentManager.onError((error) => {
      console.error('Torrent error:', error);
      this.showToast('Torrent error: ' + error, 'error');
    });

    this.torrentManager.onMultiFile((files) => {
      this.showTorrentFilePicker(files);
    });
  }

  private async loadMagnetLink(): Promise<void> {
    const input = this.elements['magnet-link-input'] as HTMLInputElement;
    if (!input) return;

    const magnetUri = input.value.trim();
    if (!magnetUri) {
      this.showToast('Please enter a magnet link', 'error');
      return;
    }

    if (!TorrentManager.isMagnet(magnetUri)) {
      this.showToast('Invalid magnet link format', 'error');
      return;
    }

    this.initTorrentManager();
    this.showToast('Loading torrent...', 'info');

    try {
      await this.torrentManager!.loadMagnet(magnetUri);
    } catch (error) {
      console.error('Failed to load magnet:', error);
      this.showToast('Failed to load torrent', 'error');
    }
  }

  private async selectTorrentFile(): Promise<void> {
    const result = await window.electronAPI.selectTorrentFile();
    if (!result) return;

    this.initTorrentManager();
    this.showToast('Loading torrent file...', 'info');

    try {
      // Decode base64 to buffer
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      await this.torrentManager!.loadTorrentFile(Buffer.from(bytes));
    } catch (error) {
      console.error('Failed to load torrent file:', error);
      this.showToast('Failed to load torrent file', 'error');
    }
  }

  private removeTorrent(): void {
    if (this.torrentManager) {
      this.torrentManager.cleanup();
    }
    this.torrentMedia = null;
    this.elements['torrent-info']?.classList.add('hidden');
    const magnetInput = this.elements['magnet-link-input'] as HTMLInputElement;
    if (magnetInput) magnetInput.value = '';
  }

  private showTorrentFilePicker(files: TorrentFileInfo[]): void {
    const modal = this.elements['torrent-file-modal'];
    const list = this.elements['torrent-file-list'];

    if (!modal || !list) return;

    // Clear existing items
    list.innerHTML = '';

    // Add file items
    files.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'torrent-file-item';
      item.innerHTML = `
        <div class="file-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/>
            <line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
        </div>
        <div class="file-details">
          <span class="file-name">${file.name}</span>
          <span class="file-size">${formatSize(file.size)}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectTorrentFileByIndex(file.index);
        this.closeTorrentFileModal();
      });

      list.appendChild(item);
    });

    modal.classList.remove('hidden');
  }

  private closeTorrentFileModal(): void {
    this.elements['torrent-file-modal']?.classList.add('hidden');
  }

  // ===== Waiting for Files Modal =====
  private showWaitingForFilesModal(statuses: FileUploadStatus[]): void {
    const modal = this.elements['waiting-files-modal'];
    if (!modal) return;

    const currentMedia = this.mediaController?.getCurrentMedia();
    if (!currentMedia) return;

    // Update filename and size
    const filenameEl = this.elements['required-filename'];
    const filesizeEl = this.elements['required-filesize'];
    if (filenameEl) filenameEl.textContent = currentMedia.filename || 'Unknown';
    if (filesizeEl) filesizeEl.textContent = `Size: ${formatSize(currentMedia.fileSize || 0)}`;

    // Update user status list
    const listEl = this.elements['user-status-list'];
    if (listEl) {
      listEl.innerHTML = '';
      statuses.forEach(status => {
        const item = document.createElement('div');
        item.className = `user-status-item ${status.hasFile ? 'has-file' : 'waiting'}`;

        const nameEl = document.createElement('span');
        nameEl.className = 'user-status-name';
        nameEl.textContent = status.nickname;

        const badge = document.createElement('span');
        badge.className = `user-status-badge ${status.hasFile ? 'ready' : 'waiting'}`;
        if (status.hasFile) {
          badge.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Ready
          `;
        } else {
          badge.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Waiting
          `;
        }

        item.appendChild(nameEl);
        item.appendChild(badge);
        listEl.appendChild(item);
      });
    }

    modal.classList.remove('hidden');
  }

  private hideWaitingForFilesModal(): void {
    this.elements['waiting-files-modal']?.classList.add('hidden');
  }

  // ===== Voting Modal =====
  private voteTimerInterval: NodeJS.Timeout | null = null;

  private showVotingModal(request: VoteRequest): void {
    const modal = this.elements['voting-modal'];
    if (!modal) return;

    // Update requester name
    const requesterEl = this.elements['vote-requester'];
    if (requesterEl) requesterEl.textContent = request.requestedByName;

    // Update file info
    const filenameEl = this.elements['vote-filename'];
    const filesizeEl = this.elements['vote-filesize'];
    const typeEl = this.elements['vote-type'];
    if (filenameEl) filenameEl.textContent = request.filename;
    if (filesizeEl) filesizeEl.textContent = formatSize(request.fileSize || 0);
    if (typeEl) {
      const badge = request.mediaType === 'torrent' ?
        '<span class="badge badge-torrent">Torrent</span>' :
        '<span class="badge badge-local">Local File</span>';
      typeEl.innerHTML = badge;
    }

    // Start timer countdown
    const startTime = request.startTime;
    const timerEl = this.elements['vote-timer'];
    if (timerEl && this.voteTimerInterval === null) {
      this.voteTimerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 30 - Math.floor(elapsed / 1000));
        timerEl.textContent = `${remaining}s`;
        if (remaining === 0 && this.voteTimerInterval) {
          clearInterval(this.voteTimerInterval);
          this.voteTimerInterval = null;
        }
      }, 100);
    }

    // Reset vote bars
    this.updateVoteCount(0, 0, 1);

    modal.classList.remove('hidden');
  }

  private hideVotingModal(): void {
    const modal = this.elements['voting-modal'];
    if (modal) {
      modal.classList.add('hidden');
    }

    // Clear timer
    if (this.voteTimerInterval) {
      clearInterval(this.voteTimerInterval);
      this.voteTimerInterval = null;
    }
  }

  private updateVoteCount(yesCount: number, noCount: number, total: number): void {
    const yesBar = this.elements['vote-bar-yes'];
    const noBar = this.elements['vote-bar-no'];
    const yesCountEl = this.elements['vote-count-yes'];
    const noCountEl = this.elements['vote-count-no'];

    if (yesBar && noBar) {
      const yesPercent = total > 0 ? (yesCount / total) * 100 : 0;
      const noPercent = total > 0 ? (noCount / total) * 100 : 0;
      yesBar.style.width = `${yesPercent}%`;
      noBar.style.width = `${noPercent}%`;
    }

    if (yesCountEl) yesCountEl.textContent = yesCount.toString();
    if (noCountEl) noCountEl.textContent = noCount.toString();
  }

  private handleVote(accept: boolean): void {
    if (!this.mediaController) return;
    this.mediaController.submitVote(accept);
  }

  private handleMediaChange(oldMedia: MediaState | null, newMedia: MediaState): void {
    // Stop current video if playing
    const videoEl = this.elements['video-player'] as HTMLVideoElement;
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';
    }

    // Clear torrent if needed
    if (this.torrentManager) {
      this.torrentManager.cleanup();
    }

    // Load new media based on type
    if (newMedia.type === 'torrent' && newMedia.magnetUri) {
      this.loadTorrentFromMediaSource(newMedia);
    } else if (newMedia.type === 'local') {
      // Local file - will be handled by file coordination system
      this.showToast(`Loading ${newMedia.filename}...`, 'info');
    }
  }

  private async loadTorrentFromMediaSource(media: MediaState): Promise<void> {
    if (!media.magnetUri || !this.torrentManager) return;

    try {
      await this.torrentManager.loadMagnet(media.magnetUri, media.fileIndex);
      this.showToast('Torrent loaded successfully', 'success');
    } catch (error: any) {
      console.error('Error loading torrent from media source:', error);
      this.showToast(`Error loading torrent: ${error.message}`, 'error');
    }
  }

  private selectTorrentFileByIndex(index: number): void {
    if (!this.torrentManager) return;

    try {
      this.torrentManager.selectFileByIndex(index);
    } catch (error) {
      console.error('Failed to select file:', error);
      this.showToast('Failed to select file', 'error');
    }
  }

  private updateTorrentProgressUI(progress: TorrentProgress): void {
    const percentEl = this.elements['torrent-progress-percent'];
    const downloadedEl = this.elements['torrent-downloaded'];
    const speedEl = this.elements['torrent-speed'];
    const peersEl = this.elements['torrent-peers'];
    const fillEl = this.elements['torrent-progress-fill'];

    const percent = Math.round(progress.progress * 100);

    if (percentEl) percentEl.textContent = `${percent}%`;
    if (downloadedEl) {
      downloadedEl.textContent = `${formatSize(progress.downloaded)} / ${formatSize(progress.total)}`;
    }
    if (speedEl) speedEl.textContent = formatSpeed(progress.downloadSpeed);
    if (peersEl) peersEl.textContent = progress.numPeers.toString();
    if (fillEl) fillEl.style.width = `${percent}%`;
  }

  private showTorrentProgress(): void {
    this.elements['torrent-progress-indicator']?.classList.remove('hidden');
  }

  private hideTorrentProgress(): void {
    this.elements['torrent-progress-indicator']?.classList.add('hidden');
  }

  // ===== Enhanced Buffering with User Info =====
  private handleBufferingInfo(info: BufferingInfo): void {
    if (info.isBuffering) {
      this.bufferingPeers.set(info.peerId, info.nickname);
    } else {
      this.bufferingPeers.delete(info.peerId);
    }

    this.updateBufferingUI();
  }

  private updateBufferingUI(): void {
    const indicator = this.elements['buffering-indicator'];
    const mainText = this.elements['buffering-text'];
    const userText = this.elements['buffering-user-text'];

    if (this.bufferingPeers.size > 0) {
      // Show buffering indicator
      indicator?.classList.remove('hidden');

      // Build user text
      const names = Array.from(this.bufferingPeers.values());
      if (names.length === 1) {
        if (mainText) mainText.textContent = 'Buffering...';
        if (userText) {
          userText.textContent = `Waiting for ${names[0]}`;
          userText.classList.remove('hidden');
        }
      } else if (names.length > 1) {
        if (mainText) mainText.textContent = 'Buffering...';
        if (userText) {
          userText.textContent = `Waiting for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
          userText.classList.remove('hidden');
        }
      }
    } else {
      // Hide buffering indicator
      indicator?.classList.add('hidden');
      if (userText) userText.classList.add('hidden');
    }
  }

  private broadcastLocalBuffering(isBuffering: boolean): void {
    if (this.network) {
      this.network.broadcastBuffering(isBuffering);
    }
  }

  // ===== Torrent Streaming in Player =====
  private async startTorrentStream(): Promise<void> {
    if (!this.torrentManager || !this.torrentMedia) {
      console.error('No torrent loaded');
      return;
    }

    const videoElement = this.elements['video-player'] as HTMLVideoElement;
    if (!videoElement) return;

    this.showTorrentProgress();

    try {
      // Stream torrent to video element
      this.torrentManager.streamTo(videoElement);

      // Set up video event handlers for buffering
      videoElement.addEventListener('waiting', () => {
        this.broadcastLocalBuffering(true);
      });

      videoElement.addEventListener('playing', () => {
        this.broadcastLocalBuffering(false);
      });

      videoElement.addEventListener('canplay', () => {
        this.broadcastLocalBuffering(false);
      });

    } catch (error) {
      console.error('Failed to start torrent stream:', error);
      this.showToast('Failed to start stream', 'error');
    }
  }

  // ===== Broadcast Media Source =====
  private broadcastMediaSource(): void {
    if (!this.network) return;

    if (this.isTorrentMode && this.torrentMedia) {
      const mediaSource: MediaSource = {
        type: 'torrent',
        magnetUri: this.torrentMedia.magnetUri,
        fileIndex: this.torrentMedia.fileIndex,
        fileName: this.torrentMedia.fileName,
        fileSize: this.torrentMedia.fileSize,
      };
      this.network.broadcastMediaSource(mediaSource);
    }
  }

  // ===== Handle Received Media Source =====
  private async handleReceivedMediaSource(source: MediaSource): Promise<void> {
    if (source.type === 'torrent' && source.magnetUri) {
      console.log('Received torrent from peer:', source.magnetUri);
      this.showToast('Loading shared torrent...', 'info');

      this.initTorrentManager();
      this.isTorrentMode = true;

      try {
        await this.torrentManager!.loadMagnet(source.magnetUri, source.fileIndex);

        // If we're in the player, start streaming
        if (this.currentScreen === 'player') {
          await this.startTorrentStream();
        }
      } catch (error) {
        console.error('Failed to load shared torrent:', error);
        this.showToast('Failed to load shared torrent', 'error');
      }
    }
  }
}

// ===== Initialize App =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LocalWatchApp();
  });
} else {
  new LocalWatchApp();
}
