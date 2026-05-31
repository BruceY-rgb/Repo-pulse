import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('repoPulseDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  openExternal: (url: string) => ipcRenderer.invoke('desktop:open-external', url),
  agent: {
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
    }) => ipcRenderer.invoke('agent:start-session', params),
    stopSession: () => ipcRenderer.invoke('agent:stop-session'),
    resolvePermission: (params: { toolUseID: string; approve: boolean; message?: string }) =>
      ipcRenderer.invoke('agent:resolve-permission', params),
    onMessage: (callback: (message: any) => void) => {
      const subscription = (_event: any, message: any) => callback(message);
      ipcRenderer.on('agent:message', subscription);
      return () => {
        ipcRenderer.removeListener('agent:message', subscription);
      };
    },
    onPermissionRequest: (callback: (request: any) => void) => {
      const subscription = (_event: any, request: any) => callback(request);
      ipcRenderer.on('agent:permission-request', subscription);
      return () => {
        ipcRenderer.removeListener('agent:permission-request', subscription);
      };
    },
  },
  git: {
    getStatus: (params: { cwd: string }) => ipcRenderer.invoke('git:get-status', params),
    selectDirectory: (params: { repositoryUrl: string }) => ipcRenderer.invoke('git:select-directory', params),
  },
});
