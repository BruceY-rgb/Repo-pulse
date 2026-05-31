type RepoPulseDesktopBridge = {
  isDesktop: true;
  platform: 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
  openExternal: (url: string) => Promise<void>;
  agent?: {
    startSession: (params: {
      repositoryId: string;
      gitUrl: string;
      defaultBranch: string;
      prompt: string;
      apiKey: string;
      model?: string;
      baseUrl?: string;
      authorizedLocalCwd?: string;
      sdkSessionId?: string | null;
    }) => Promise<any>;
    stopSession: () => Promise<any>;
    resolvePermission: (params: { toolUseID: string; approve: boolean }) => Promise<any>;
    onMessage: (callback: (message: any) => void) => () => void;
    onPermissionRequest: (callback: (request: any) => void) => () => void;
  };
};

declare global {
  interface Window {
    repoPulseDesktop?: RepoPulseDesktopBridge;
  }
}

const DEFAULT_DESKTOP_API_BASE_URL = 'http://127.0.0.1:3001';

export function isDesktopRuntime() {
  return window.repoPulseDesktop?.isDesktop === true;
}

export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  if (isDesktopRuntime()) {
    return DEFAULT_DESKTOP_API_BASE_URL;
  }

  return '/api';
}

export function toApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (baseUrl === '/api') {
    return normalizedPath.startsWith('/api') ? normalizedPath : `/api${normalizedPath}`;
  }

  const backendPath = normalizedPath.replace(/^\/api(?=\/|$)/, '') || '/';
  return `${baseUrl}${backendPath}`;
}

export function getSocketUrl(namespace: string) {
  const baseUrl = getApiBaseUrl();
  const normalizedNamespace = namespace.startsWith('/') ? namespace : `/${namespace}`;

  if (baseUrl === '/api') {
    return normalizedNamespace;
  }

  return `${baseUrl}${normalizedNamespace}`;
}

export function getLoginRoute() {
  return isDesktopRuntime() ? '#/login' : '/login';
}
