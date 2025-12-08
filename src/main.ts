import { app, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'LocalWatch',
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? true : true,
    show: false, // Don't show until ready
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open DevTools in development
  if (!app.isPackaged || process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle fullscreen
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', false);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ===== IPC Handlers =====

// Select video file
ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Video Files',
        extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];

  // Get file stats
  const stats = fs.statSync(filePath);

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    formattedSize: formatFileSize(stats.size),
  };
});

// Validate file path
ipcMain.handle('validate-file-path', async (_event, filePath: string) => {
  try {
    const exists = fs.existsSync(filePath);
    if (!exists) {
      return { valid: false, error: 'File not found' };
    }

    const stats = fs.statSync(filePath);
    return {
      valid: true,
      size: stats.size,
      path: filePath,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Calculate quick file hash (first 64KB + last 64KB + file size)
// This is fast and sufficient for identifying identical files
ipcMain.handle('get-file-hash', async (_event, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const chunkSize = 64 * 1024; // 64KB

    const hash = crypto.createHash('md5');

    // Read first chunk
    const fd = fs.openSync(filePath, 'r');
    const buffer1 = Buffer.alloc(Math.min(chunkSize, fileSize));
    fs.readSync(fd, buffer1, 0, buffer1.length, 0);
    hash.update(buffer1);

    // Read last chunk (if file is large enough)
    if (fileSize > chunkSize * 2) {
      const buffer2 = Buffer.alloc(chunkSize);
      fs.readSync(fd, buffer2, 0, chunkSize, fileSize - chunkSize);
      hash.update(buffer2);
    }

    fs.closeSync(fd);

    // Include file size in hash
    hash.update(fileSize.toString());

    return {
      hash: hash.digest('hex'),
      size: fileSize,
    };
  } catch (error) {
    console.error('Error calculating file hash:', error);
    return {
      hash: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Get video file information
ipcMain.handle('get-video-info', async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found' };
    }

    const stats = fs.statSync(filePath);

    return {
      exists: true,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      name: path.basename(filePath),
      path: filePath,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Toggle fullscreen
ipcMain.handle('toggle-fullscreen', async () => {
  if (mainWindow) {
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
    return !isFullScreen;
  }
  return false;
});

// Get fullscreen state
ipcMain.handle('get-fullscreen-state', async () => {
  return mainWindow?.isFullScreen() ?? false;
});

// Show confirmation dialog
ipcMain.handle('show-confirm-dialog', async (_event, options: {
  title: string;
  message: string;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
}) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    buttons: [options.cancelText || 'Cancel', options.confirmText || 'OK'],
    defaultId: 1,
    cancelId: 0,
    title: options.title,
    message: options.message,
    detail: options.detail,
  });

  return result.response === 1;
});

// Utility function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
