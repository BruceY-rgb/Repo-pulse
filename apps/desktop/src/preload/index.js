const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  showNotification: (opts) =>
    ipcRenderer.invoke('desktop:show-notification', opts),
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:get-api-base-url'),
});
