const { app, BrowserWindow } = require('electron');
const path = require('path');
const server = require('./src/backend/server'); // Import the Express app
const { initializeDatabase } = require('./src/db/database');

const PORT = 3000; // Port for our Express server

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      // It's recommended to set contextIsolation to true and use a preload script.
      // For this refactoring, we'll keep it simple, but for a new app, this should be true.
      contextIsolation: false,
      nodeIntegration: true // This is needed for the renderer to use `require` if necessary
    },
    icon: path.join(__dirname, 'src/frontend/favicon.ico') // Assuming you might have a favicon
  });

  // Load the index.html of the app.
  // We will load the local frontend file.
  mainWindow.loadFile(path.join(__dirname, 'src/frontend/index.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // 1. Initialize the database
  initializeDatabase();

  // 2. Start the Express server
  server.listen(PORT, () => {
    console.log(`Express server listening on http://localhost:${PORT}`);

    // 3. Create the Electron window
    createWindow();
  });

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
