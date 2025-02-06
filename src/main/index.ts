import { app, shell, BrowserWindow, ipcMain, net, dialog } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs/promises';
import sharp from 'sharp';
import { SelectionData } from '../shared/types'

/** This is the electron backend code */

// Add this state variable at the top level
let currentFolderPath: string | null = null;

const IMAGE_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true, // Enable context isolation for security
      nodeIntegration: false, // Disable node integration for security
      webSecurity: true, // Keep this true for security
    }
  })
  
  // Replace the old protocol handler with the new one
  mainWindow.webContents.session.protocol.handle("atom", async (request) => {
    try {
      if (!currentFolderPath) {
        return new Response("No folder selected", { status: 404 });
      }

      const fileName = decodeURIComponent(request.url.replace("atom://", ""));
      const filePath = `file://${path.join(currentFolderPath, fileName)}`;
      return net.fetch(filePath);
    } catch (error) {
      console.error("Protocol handler error:", error);
      return new Response("Error loading file", { status: 404 });
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Add these IPC handlers after the app event handlers
ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (!result.canceled) {
    currentFolderPath = result.filePaths[0];
    return currentFolderPath;
  }
  return null;
});

ipcMain.handle("folder:getFiles", async () => {
  if (!currentFolderPath) {
    return [];
  }

  try {
    const allFiles = await fs.readdir(currentFolderPath);
    const imageFiles = allFiles.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return IMAGE_FILE_EXTENSIONS.includes(ext);
    });
    return imageFiles;
  } catch (error) {
    console.error("Error reading directory:", error);
    throw error;
  }
});

ipcMain.handle("image:getMetadata", async (_, filename: string) => {
  if (!currentFolderPath) {
    throw new Error("No folder selected");
  }

  try {
    const imagePath = path.join(currentFolderPath, filename);
    const metadata = await sharp(imagePath).metadata();
    return metadata;
  } catch (error) {
    console.error("Error getting image metadata:", error);
    throw error;
  }
});

ipcMain.handle('save-selections', async (_event, data: { imagePath: string, selection: SelectionData }) => {
  // This is just a stub for now
  console.log('Received selection to save:', {
    image: data.imagePath,
    selection: data.selection
  })
  // Here you would typically save the selection to a file or database
  return Promise.resolve()
})
