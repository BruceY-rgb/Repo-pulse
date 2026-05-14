const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  loginWithGithub: () => ipcRenderer.invoke('desktop:github-login'),
  showNotification: (opts) =>
    ipcRenderer.invoke('desktop:show-notification', opts),
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:get-api-base-url'),
});
