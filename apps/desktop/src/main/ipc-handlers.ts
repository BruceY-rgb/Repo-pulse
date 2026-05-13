import { BrowserWindow, Notification, ipcMain, shell } from 'electron';

export function registerIpcHandlers() {
  ipcMain.handle('desktop:open-external', (_event, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return shell.openExternal(url);
    }
    return Promise.resolve();
  });

  ipcMain.handle(
    'desktop:show-notification',
    (_event, opts: { title: string; body: string }) => {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: opts.title,
          body: opts.body,
        });
        notification.on('click', () => {
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        });
        notification.show();
      }
      return Promise.resolve();
    },
  );

  ipcMain.handle('desktop:get-api-base-url', () => {
    return process.env.API_BASE_URL || 'http://127.0.0.1:3001';
  });
}
