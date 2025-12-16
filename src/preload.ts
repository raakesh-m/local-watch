import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Video file operations
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  selectTorrentFile: () => ipcRenderer.invoke('select-torrent-file'),
  validateFilePath: (filePath: string) =>
    ipcRenderer.invoke('validate-file-path', filePath),
  getVideoInfo: (filePath: string) =>
    ipcRenderer.invoke('get-video-info', filePath),
  getFileHash: (filePath: string) =>
    ipcRenderer.invoke('get-file-hash', filePath),

  // Window operations
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  getFullscreenState: () => ipcRenderer.invoke('get-fullscreen-state'),

  // Dialogs
  showConfirmDialog: (options: {
    title: string;
    message: string;
    detail?: string;
    confirmText?: string;
    cancelText?: string;
  }) => ipcRenderer.invoke('show-confirm-dialog', options),

  // Event listeners
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    ipcRenderer.on('fullscreen-change', (_event, isFullscreen) => {
      callback(isFullscreen);
    });
  },

  // Remove listeners (for cleanup)
  removeFullscreenListener: () => {
    ipcRenderer.removeAllListeners('fullscreen-change');
  },
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      selectVideoFile: () => Promise<{
        path: string;
        name: string;
        size: number;
        formattedSize: string;
      } | null>;
      selectTorrentFile: () => Promise<{
        path: string;
        name: string;
        data: string; // base64 encoded torrent file
      } | null>;
      validateFilePath: (filePath: string) => Promise<{
        valid: boolean;
        size?: number;
        path?: string;
        error?: string;
      }>;
      getVideoInfo: (filePath: string) => Promise<{
        exists?: boolean;
        size?: number;
        formattedSize?: string;
        name?: string;
        path?: string;
        error?: string;
      }>;
      getFileHash: (filePath: string) => Promise<{
        hash: string | null;
        size?: number;
        error?: string;
      }>;
      toggleFullscreen: () => Promise<boolean>;
      getFullscreenState: () => Promise<boolean>;
      showConfirmDialog: (options: {
        title: string;
        message: string;
        detail?: string;
        confirmText?: string;
        cancelText?: string;
      }) => Promise<boolean>;
      onFullscreenChange: (callback: (isFullscreen: boolean) => void) => void;
      removeFullscreenListener: () => void;
    };
  }
}
