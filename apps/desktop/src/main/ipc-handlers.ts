import { BrowserWindow, Notification, ipcMain, shell } from 'electron';

type GithubLoginResult =
  | { ok: true }
  | { ok: false; reason?: string };

function getApiBaseUrl() {
  return process.env.API_BASE_URL || 'http://localhost:3001';
}

function parseOAuthResult(url: string): GithubLoginResult | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.pathname === '/auth/callback') {
    return { ok: true };
  }

  if (parsed.pathname === '/login' && parsed.searchParams.get('error') === 'oauth_failed') {
    return {
      ok: false,
      reason: parsed.searchParams.get('reason') ?? 'oauth_failed',
    };
  }

  return null;
}

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
    return getApiBaseUrl();
  });

  ipcMain.handle('desktop:github-login', (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;

    return new Promise<GithubLoginResult>((resolve) => {
      const authWindow = new BrowserWindow({
        width: 980,
        height: 760,
        minWidth: 720,
        minHeight: 560,
        parent,
        modal: false,
        title: 'Sign in with GitHub',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          session: parent?.webContents.session,
        },
      });

      let settled = false;

      const finish = (result: GithubLoginResult) => {
        if (settled) return;
        settled = true;
        resolve(result);

        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
      };

      const inspectNavigation = (url: string) => {
        const result = parseOAuthResult(url);
        if (result) {
          finish(result);
        }
      };

      authWindow.webContents.on('did-redirect-navigation', (_navigationEvent, url) => {
        inspectNavigation(url);
      });
      authWindow.webContents.on('did-navigate', (_navigationEvent, url) => {
        inspectNavigation(url);
      });
      authWindow.webContents.on('did-navigate-in-page', (_navigationEvent, url) => {
        inspectNavigation(url);
      });
      authWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        if (errorCode === -3) {
          return;
        }

        finish({ ok: false, reason: errorDescription || 'load_failed' });
      });
      authWindow.on('closed', () => {
        if (!settled) {
          finish({ ok: false, reason: 'closed' });
        }
      });

      authWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://') || url.startsWith('http://')) {
          authWindow.loadURL(url);
        }
        return { action: 'deny' };
      });

      authWindow.loadURL(`${getApiBaseUrl()}/auth/github`).catch((error) => {
        finish({ ok: false, reason: error instanceof Error ? error.message : 'load_failed' });
      });
    });
  });
}
