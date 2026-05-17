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
});
