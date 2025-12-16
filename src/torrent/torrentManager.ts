/**
 * TorrentManager - Handles WebTorrent streaming for LocalWatch
 * Supports both magnet links and .torrent files
 */

import WebTorrent from 'webtorrent';
import type { Torrent, TorrentFile } from 'webtorrent';

// WebTorrent trackers for WebRTC peer discovery
const TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
];

// Minimum file size to consider as video (10MB)
const MIN_VIDEO_SIZE = 10 * 1024 * 1024;

// Common video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];

// Type for WebTorrent add options
interface TorrentOptions {
  announce?: string[];
  destroyStoreOnDestroy?: boolean;
  maxWebConns?: number;
  strategy?: string;
}

export interface TorrentProgress {
  downloaded: number;
  total: number;
  progress: number; // 0-1
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  timeRemaining: number; // ms
}

export interface TorrentFileInfo {
  name: string;
  size: number;
  index: number;
}

export type TorrentStatus = 'idle' | 'loading' | 'downloading' | 'ready' | 'error';

export class TorrentManager {
  private client: WebTorrent.Instance | null = null;
  private currentTorrent: Torrent | null = null;
  private currentFile: TorrentFile | null = null;
  private status: TorrentStatus = 'idle';
  private progressInterval: NodeJS.Timeout | null = null;

  // Callbacks
  private onProgressCallback: ((progress: TorrentProgress) => void) | null = null;
  private onReadyCallback: ((file: TorrentFileInfo) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onStatusChangeCallback: ((status: TorrentStatus) => void) | null = null;
  private onMultiFileCallback: ((files: TorrentFileInfo[]) => void) | null = null;

  constructor() {
    this.initClient();
  }

  /**
   * Initialize WebTorrent client
   */
  private initClient(): void {
    if (this.client) return;

    this.client = new WebTorrent({
      maxConns: 55, // Max connections per torrent
    });

    this.client.on('error', (err: Error | string) => {
      console.error('WebTorrent client error:', err);
      this.setStatus('error');
      if (this.onErrorCallback) {
        const message = typeof err === 'string' ? err : err.message;
        this.onErrorCallback(message);
      }
    });
  }

  /**
   * Check if a string is a magnet link
   */
  static isMagnet(input: string): boolean {
    return input.trim().startsWith('magnet:');
  }

  /**
   * Check if a file is a video based on extension
   */
  private isVideoFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
  }

  /**
   * Get video files from torrent, filtered and sorted by size
   */
  private getVideoFiles(torrent: Torrent): TorrentFile[] {
    return torrent.files
      .filter(f => f.length >= MIN_VIDEO_SIZE && this.isVideoFile(f.name))
      .sort((a, b) => b.length - a.length); // Largest first
  }

  /**
   * Load a torrent from magnet link
   */
  async loadMagnet(magnetUri: string, fileIndex?: number): Promise<void> {
    if (!this.client) {
      throw new Error('WebTorrent client not initialized');
    }

    // Cleanup previous torrent
    await this.cleanup();

    this.setStatus('loading');

    return new Promise((resolve, reject) => {
      // Check if already loaded
      const existing = this.client!.get(magnetUri);

      const handleTorrent = (torrent: Torrent) => {
        const onReady = () => {
          this.currentTorrent = torrent;
          console.log('Torrent ready:', torrent.infoHash);

          const videoFiles = this.getVideoFiles(torrent);

          if (videoFiles.length === 0) {
            this.setStatus('error');
            reject(new Error('No video files found in torrent'));
            return;
          }

          // If fileIndex specified, use that file
          if (fileIndex !== undefined && fileIndex >= 0 && fileIndex < torrent.files.length) {
            this.selectFile(torrent.files[fileIndex]);
            resolve();
            return;
          }

          // Auto-select if only one video file
          if (videoFiles.length === 1) {
            this.selectFile(videoFiles[0]);
            resolve();
            return;
          }

          // Multiple files - trigger callback for user selection
          if (this.onMultiFileCallback) {
            const fileInfos: TorrentFileInfo[] = videoFiles.map((f) => ({
              name: f.name,
              size: f.length,
              index: torrent.files.indexOf(f),
            }));
            this.onMultiFileCallback(fileInfos);
          }

          resolve();
        };

        if (torrent.ready) {
          onReady();
        } else {
          torrent.on('ready', onReady);
        }

        (torrent as any).on('error', (err: Error) => {
          console.error('Torrent error:', err);
          this.setStatus('error');
          reject(err);
        });
      };

      if (existing && typeof (existing as any).infoHash === 'string') {
        // existing is a Torrent, not a Promise
        handleTorrent(existing as unknown as Torrent);
      } else {
        const torrent = this.client!.add(magnetUri, {
          announce: TRACKERS,
          destroyStoreOnDestroy: true,
          maxWebConns: 4,
          strategy: 'sequential',
        } as TorrentOptions) as unknown as Torrent;
        handleTorrent(torrent);
      }
    });
  }

  /**
   * Load a torrent from .torrent file buffer
   */
  async loadTorrentFile(buffer: Buffer, fileIndex?: number): Promise<void> {
    if (!this.client) {
      throw new Error('WebTorrent client not initialized');
    }

    // Cleanup previous torrent
    await this.cleanup();

    this.setStatus('loading');

    return new Promise((resolve, reject) => {
      const torrent = this.client!.add(buffer, {
        announce: TRACKERS,
        destroyStoreOnDestroy: true,
        maxWebConns: 4,
        strategy: 'sequential',
      } as TorrentOptions) as Torrent;

      torrent.on('ready', () => {
        this.currentTorrent = torrent;
        console.log('Torrent ready:', torrent.infoHash);

        const videoFiles = this.getVideoFiles(torrent);

        if (videoFiles.length === 0) {
          this.setStatus('error');
          reject(new Error('No video files found in torrent'));
          return;
        }

        // If fileIndex specified, use that file
        if (fileIndex !== undefined && fileIndex >= 0 && fileIndex < torrent.files.length) {
          this.selectFile(torrent.files[fileIndex]);
          resolve();
          return;
        }

        // Auto-select if only one video file
        if (videoFiles.length === 1) {
          this.selectFile(videoFiles[0]);
          resolve();
          return;
        }

        // Multiple files - trigger callback
        if (this.onMultiFileCallback) {
          const fileInfos: TorrentFileInfo[] = videoFiles.map((f) => ({
            name: f.name,
            size: f.length,
            index: torrent.files.indexOf(f),
          }));
          this.onMultiFileCallback(fileInfos);
        }

        resolve();
      });

      (torrent as any).on('error', (err: Error) => {
        console.error('Torrent error:', err);
        this.setStatus('error');
        reject(err);
      });
    });
  }

  /**
   * Select a specific file from the torrent to stream
   */
  selectFile(file: TorrentFile): void {
    this.currentFile = file;
    this.setStatus('downloading');
    this.startProgressUpdates();

    if (this.onReadyCallback) {
      this.onReadyCallback({
        name: file.name,
        size: file.length,
        index: this.currentTorrent?.files.indexOf(file) ?? 0,
      });
    }
  }

  /**
   * Select file by index
   */
  selectFileByIndex(index: number): void {
    if (!this.currentTorrent) {
      throw new Error('No torrent loaded');
    }

    if (index < 0 || index >= this.currentTorrent.files.length) {
      throw new Error('Invalid file index');
    }

    this.selectFile(this.currentTorrent.files[index]);
  }

  /**
   * Stream the selected file to a video element
   */
  streamTo(videoElement: HTMLVideoElement): void {
    if (!this.currentFile) {
      throw new Error('No file selected');
    }

    // Use renderTo which creates a blob URL and sets it as src
    (this.currentFile as any).renderTo(videoElement, {
      autoplay: false,
      controls: false,
    }, (err: Error | null) => {
      if (err) {
        console.error('Error streaming to video element:', err);
        if (this.onErrorCallback) {
          this.onErrorCallback(err.message);
        }
      } else {
        this.setStatus('ready');
        console.log('Streaming started');
      }
    });
  }

  /**
   * Get blob URL for the current file (alternative streaming method)
   */
  async getBlobURL(): Promise<string> {
    if (!this.currentFile) {
      throw new Error('No file selected');
    }

    return new Promise((resolve, reject) => {
      (this.currentFile as any).getBlobURL((err: Error | null, url: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(url);
        }
      });
    });
  }

  /**
   * Start progress update interval
   */
  private startProgressUpdates(): void {
    this.stopProgressUpdates();

    this.progressInterval = setInterval(() => {
      if (this.currentTorrent && this.onProgressCallback) {
        this.onProgressCallback({
          downloaded: this.currentTorrent.downloaded,
          total: this.currentTorrent.length,
          progress: this.currentTorrent.progress,
          downloadSpeed: this.currentTorrent.downloadSpeed,
          uploadSpeed: this.currentTorrent.uploadSpeed,
          numPeers: this.currentTorrent.numPeers,
          timeRemaining: this.currentTorrent.timeRemaining,
        });
      }
    }, 1000);
  }

  /**
   * Stop progress update interval
   */
  private stopProgressUpdates(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * Set status and trigger callback
   */
  private setStatus(status: TorrentStatus): void {
    this.status = status;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status);
    }
  }

  /**
   * Get current status
   */
  getStatus(): TorrentStatus {
    return this.status;
  }

  /**
   * Get current progress
   */
  getProgress(): TorrentProgress | null {
    if (!this.currentTorrent) return null;

    return {
      downloaded: this.currentTorrent.downloaded,
      total: this.currentTorrent.length,
      progress: this.currentTorrent.progress,
      downloadSpeed: this.currentTorrent.downloadSpeed,
      uploadSpeed: this.currentTorrent.uploadSpeed,
      numPeers: this.currentTorrent.numPeers,
      timeRemaining: this.currentTorrent.timeRemaining,
    };
  }

  /**
   * Get magnet URI for current torrent (to share with peers)
   */
  getMagnetURI(): string | null {
    return this.currentTorrent?.magnetURI ?? null;
  }

  /**
   * Get info hash for current torrent
   */
  getInfoHash(): string | null {
    return this.currentTorrent?.infoHash ?? null;
  }

  /**
   * Get selected file info
   */
  getSelectedFileInfo(): TorrentFileInfo | null {
    if (!this.currentFile || !this.currentTorrent) return null;

    return {
      name: this.currentFile.name,
      size: this.currentFile.length,
      index: this.currentTorrent.files.indexOf(this.currentFile),
    };
  }

  /**
   * Cleanup current torrent
   */
  async cleanup(): Promise<void> {
    this.stopProgressUpdates();

    if (this.currentTorrent) {
      return new Promise((resolve) => {
        this.currentTorrent!.destroy({
          destroyStore: true,
        }, () => {
          this.currentTorrent = null;
          this.currentFile = null;
          this.setStatus('idle');
          resolve();
        });
      });
    }

    this.currentFile = null;
    this.setStatus('idle');
  }

  /**
   * Destroy the WebTorrent client
   */
  async destroy(): Promise<void> {
    await this.cleanup();

    if (this.client) {
      return new Promise((resolve) => {
        this.client!.destroy((err) => {
          if (err) {
            console.error('Error destroying WebTorrent client:', err);
          }
          this.client = null;
          resolve();
        });
      });
    }
  }

  // Callback setters
  onProgress(callback: (progress: TorrentProgress) => void): void {
    this.onProgressCallback = callback;
  }

  onReady(callback: (file: TorrentFileInfo) => void): void {
    this.onReadyCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  onStatusChange(callback: (status: TorrentStatus) => void): void {
    this.onStatusChangeCallback = callback;
  }

  onMultiFile(callback: (files: TorrentFileInfo[]) => void): void {
    this.onMultiFileCallback = callback;
  }
}

// Utility functions for formatting
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
  if (bytes >= 1024) {
    return (bytes / 1024).toFixed(0) + ' KB';
  }
  return bytes + ' B';
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) {
    return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
  }
  if (bytesPerSec >= 1024) {
    return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
  }
  return bytesPerSec + ' B/s';
}

export function formatTime(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '--:--';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
