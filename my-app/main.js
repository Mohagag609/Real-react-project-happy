// my-app/main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { startServer, stopServer } = require('./server');

// Set a consistent App User Model ID for Windows notifications and taskbar grouping.
// The name 'MyApp' should be consistent with the one used for the userData path.
const APP_ID = 'com.electron.myapp';
app.setAppUserModelId(APP_ID);

// Set the application name for the user data directory.
// This ensures the database path is predictable.
app.setName('MyApp');

let mainWindow;

/**
 * Creates the main application window.
 */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    icon: path.join(__dirname, 'assets', 'icon.png'), // Optional: Add an icon
    webPreferences: {
      // Enforce security best practices.
      contextIsolation: true,
      nodeIntegration: false,
      // No preload script is needed as communication happens via HTTP to localhost.
    },
  });

  // Load the application's entry point.
  await mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Automatically open external links in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// This method will be called when Electron has finished initialization.
app.whenReady().then(async () => {
  // Define the database path within the app's user data directory.
  // This is the recommended location to store persistent app data.
  const dbPath = path.join(app.getPath('userData'), 'app.db');

  try {
    // Start the backend server before creating the UI.
    await startServer(dbPath);

    // Create the main application window.
    await createWindow();

    // On macOS, re-create a window if the app is activated with no windows open.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });

  } catch (error) {
    console.error('Fatal error during application startup:', error);
    // If the server fails to start, quit the app to avoid an inconsistent state.
    app.quit();
  }
});

// This event is fired when all windows have been closed.
app.on('window-all-closed', () => {
  // On macOS, applications and their menu bar often stay active until the user quits explicitly.
  if (process.platform !== 'darwin') {
    app.quit(); // On other platforms, closing the last window quits the app.
  }
});

// This event is fired before the application starts closing its windows.
// It's the most reliable place to perform cleanup.
app.on('before-quit', async (event) => {
  // We must prevent the default action to perform async cleanup.
  event.preventDefault();

  console.log('Shutting down gracefully...');
  try {
    await stopServer();
    console.log('Cleanup complete. Exiting.');
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
  } finally {
    // Once cleanup is done, exit the application.
    app.exit();
  }
});
