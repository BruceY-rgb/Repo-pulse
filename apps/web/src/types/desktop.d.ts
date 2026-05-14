interface DesktopApi {
  openExternal(url: string): Promise<void>;
  loginWithGithub(): Promise<{ ok: true } | { ok: false; reason?: string }>;
  showNotification(opts: { title: string; body: string }): Promise<void>;
  getApiBaseUrl(): Promise<string>;
}

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}

export {};
