const { contextBridge, ipcRenderer } = require("electron");
const WINDOW_MAXIMIZED_CHANNEL = "touch-grass:window-maximized-changed";

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
  async windowIsMaximized() {
    return ipcRenderer.invoke("touch-grass:window-is-maximized");
  },
  onWindowMaximizedChange(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, isMaximized) => callback(Boolean(isMaximized));

    ipcRenderer.on(WINDOW_MAXIMIZED_CHANNEL, listener);
    return () => ipcRenderer.removeListener(WINDOW_MAXIMIZED_CHANNEL, listener);
  },
});
