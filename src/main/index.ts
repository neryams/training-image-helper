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
let outputDimensions: { width: number, height: number } = { width: 512, height: 512 };

// Update the type definition for the dictionary entries
interface ImageDictionaryEntry {
  imagePath: string;
  caption: string;
}

// Update the type of imageDictionary
let imageDictionary: Map<string, ImageDictionaryEntry> = new Map();

const IMAGE_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const OUTPUT_SUBDIR = "output";

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

// Add this function to load the dictionary from JSON
async function loadImageDictionary(outputDir: string) {
  const dictionaryPath = path.join(outputDir, 'image_captions.json');
  
  try {
    const exists = await fs.access(dictionaryPath).then(() => true).catch(() => false);
    if (!exists) {
      console.log('No existing dictionary file found');
      return;
    }

    const jsonContent = await fs.readFile(dictionaryPath, 'utf-8');
    const dictionaryArray = JSON.parse(jsonContent) as ImageDictionaryEntry[];
    
    // Clear existing dictionary and populate from file
    imageDictionary.clear();
    dictionaryArray.forEach(entry => {
      const outputPath = path.join(outputDir, path.basename(entry.imagePath));
      imageDictionary.set(outputPath, entry);
    });
    
    console.log('Loaded existing image dictionary from:', dictionaryPath);
  } catch (error) {
    console.error('Error loading image dictionary:', error);
    // Don't throw - just start with empty dictionary if there's an error
  }
}

// Modify the dialog:openFolder handler to load the dictionary when a folder is selected
ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (!result.canceled) {
    currentFolderPath = result.filePaths[0];
    
    // Load existing dictionary if available
    const outputDir = path.join(currentFolderPath, OUTPUT_SUBDIR);
    await loadImageDictionary(outputDir);
    
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

  if(filename.startsWith("atom://")) {
    filename = filename.replace("atom://", "");
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

// Add a function to save the dictionary to JSON
async function saveImageDictionary(outputDir: string) {
  const dictionaryPath = path.join(outputDir, 'image_captions.json');
  
  // Convert Map to array format
  const dictionaryArray = Array.from(imageDictionary.values());
  
  try {
    await fs.writeFile(
      dictionaryPath, 
      JSON.stringify(dictionaryArray, null, 2),
      'utf-8'
    );
    console.log('Saved image dictionary to:', dictionaryPath);
  } catch (error) {
    console.error('Error saving image dictionary:', error);
    throw error;
  }
}

// Update the save-selections handler
ipcMain.handle('save-selections', async (_event, data: { imagePath: string, selection: SelectionData }) => {
  if (!currentFolderPath) {
    throw new Error("No folder selected");
  }

  try {
    // Create output directory if it doesn't exist
    const outputDir = path.join(currentFolderPath, OUTPUT_SUBDIR)
    await fs.mkdir(outputDir, { recursive: true })

    // Get the input image path
    const inputPath = path.join(currentFolderPath, data.imagePath)
    
    // Generate output filename - append '_cropped' before the extension
    const ext = path.extname(data.imagePath)
    const basename = path.basename(data.imagePath, ext)
    const outputPath = path.join(outputDir, `${basename}${ext}`)

    // Load image, crop it, resize it, and save to output directory
    await sharp(inputPath)
      .extract({
        left: Math.round(data.selection.x),
        top: Math.round(data.selection.y),
        width: Math.round(data.selection.width),
        height: Math.round(data.selection.height)
      })
      .resize(outputDimensions.width, outputDimensions.height, {
        fit: 'fill'  // Force resize to exact dimensions
      })
      .toFile(outputPath)

    // Update the image dictionary with the new entry
    imageDictionary.set(outputPath, {
      imagePath: data.imagePath,
      caption: data.selection.caption || ''
    });

    // Save the updated dictionary to JSON
    await saveImageDictionary(outputDir);
    
    console.log('Saved cropped and resized image:', outputPath)
    return outputPath
  } catch (error) {
    console.error('Error saving cropped image:', error)
    throw error
  }
});

// Add this new IPC handler after the other handlers
ipcMain.handle("dictionary:get", async () => {
  if (!currentFolderPath) {
    return [];
  }

  // Convert Map to array format
  return Array.from(imageDictionary.values());
});
