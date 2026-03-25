/* eslint-disable security/detect-non-literal-fs-filename */
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs").promises;
const path = require("path");

function getWindowIconPath() {
  return path.join(__dirname, "icon-512.png");
}

function normalizeRelativePath(inputPath) {
  const normalized = inputPath
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error(`Invalid relative path: ${inputPath}`);
  }
  return normalized;
}

function getStorageRoot() {
  return path.join(app.getPath("userData"), "touch-grass-bible");
}

function getAssetRoot() {
  return __dirname;
}

function storagePathForKey(key) {
  return path.join(getStorageRoot(), ".tg-storage", `${encodeURIComponent(key)}.txt`);
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function registerPlatformHandlers() {
  ipcMain.handle("touch-grass:get-storage-item", async (_event, key) => readIfExists(storagePathForKey(key)));

  ipcMain.handle("touch-grass:set-storage-item", async (_event, key, value) => {
    const filePath = storagePathForKey(key);
    await ensureParentDirectory(filePath);
    await fs.writeFile(filePath, value, "utf8");
  });

  ipcMain.handle("touch-grass:read-text-file", async (_event, relativePath) => {
    const filePath = path.join(getStorageRoot(), normalizeRelativePath(relativePath));
    const value = await readIfExists(filePath);
    if (value === null) {
      throw new Error(`File not found: ${relativePath}`);
    }
    return value;
  });

  ipcMain.handle("touch-grass:write-text-file", async (_event, relativePath, content) => {
    const filePath = path.join(getStorageRoot(), normalizeRelativePath(relativePath));
    await ensureParentDirectory(filePath);
    await fs.writeFile(filePath, content, "utf8");
  });

  ipcMain.handle("touch-grass:read-asset-text", async (_event, relativePath) => {
    const filePath = path.join(getAssetRoot(), normalizeRelativePath(relativePath));
    return fs.readFile(filePath, "utf8");
  });

  ipcMain.handle("touch-grass:window-minimize", async event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.handle("touch-grass:window-maximize", async event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle("touch-grass:window-close", async event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.handle("touch-grass:window-is-maximized", async event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: "hidden",
    icon: getWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: `${__dirname}/preload.js`,
      sandbox: false,
    },
  });

  const emitWindowMaximizedState = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("touch-grass:window-maximized-changed", win.isMaximized());
    }
  };

  win.on("maximize", emitWindowMaximizedState);
  win.on("unmaximize", emitWindowMaximizedState);
  win.webContents.on("did-finish-load", emitWindowMaximizedState);

  win.loadFile("index.html");
};

app.whenReady().then(() => {
  registerPlatformHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
