import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { URL } from 'node:url';

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';

let mainWindow: BrowserWindow | null = null;

function getPreloadPath() {
  return path.join(__dirname, '../preload/preload.js');
}

function getPackagedWebEntry() {
  return path.join(process.resourcesPath, 'web/dist/index.html');
}

function isTrustedAppUrl(url: string) {
  if (isDev) {
    return url.startsWith(devServerUrl);
  }

  return url.startsWith('file://');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Repo Pulse',
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 16 } } : {}),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(getPackagedWebEntry());
  }
}

function registerIpcHandlers() {
  ipcMain.handle('desktop:open-external', async (_event, rawUrl: string) => {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol: ${url.protocol}`);
    }

    await shell.openExternal(url.toString());
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
