const { contextBridge, ipcRenderer } = require('electron');

// It's a good practice to expose specific functionalities
// instead of the whole 'electron' or 'require' modules.

// For this application, the most important piece of information
// the frontend needs is the port the API server is running on.
// The main process could pass this to the window, or we can
// define it here as a constant since it's fixed in main.js.

window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script loaded.');
});


// Expose a simple API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  getApiPort: () => 3000, // The port we defined in main.js
});
