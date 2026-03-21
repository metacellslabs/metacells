const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('metacellsDesktop', {
  isElectron: true,
});
