import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  getVideoDuration: (filePath: string) =>
    ipcRenderer.invoke('get-video-duration', filePath),
  validateFilePath: (filePath: string) =>
    ipcRenderer.invoke('validate-file-path', filePath),
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      selectVideoFile: () => Promise<string | null>;
      getVideoDuration: (filePath: string) => Promise<{
        exists: boolean;
        size: number;
        path: string;
      }>;
      validateFilePath: (filePath: string) => Promise<{
        valid: boolean;
        size?: number;
        path?: string;
        error?: string;
      }>;
    };
  }
}
