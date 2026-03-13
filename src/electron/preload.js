const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("touchGrassElectronPlatform", {
  async storageGetItem(key) {
    return ipcRenderer.invoke("touch-grass:get-storage-item", key);
  },
  async storageSetItem(key, value) {
    await ipcRenderer.invoke("touch-grass:set-storage-item", key, value);
  },
  async readTextFile(relativePath) {
    return ipcRenderer.invoke("touch-grass:read-text-file", relativePath);
  },
  async writeTextFile(relativePath, content) {
    await ipcRenderer.invoke("touch-grass:write-text-file", relativePath, content);
  },
  async readAssetText(relativePath) {
    return ipcRenderer.invoke("touch-grass:read-asset-text", relativePath);
  },
  async windowMinimize() {
    await ipcRenderer.invoke("touch-grass:window-minimize");
  },
  async windowMaximize() {
    await ipcRenderer.invoke("touch-grass:window-maximize");
  },
  async windowClose() {
    await ipcRenderer.invoke("touch-grass:window-close");
  },
});
