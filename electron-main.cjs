const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');

let mainWindow;

// Find a free port starting from 3000
function findFreePort(startPort, callback) {
  const server = net.createServer();
  server.listen(startPort, () => {
    const port = server.address().port;
    server.close(() => {
      callback(port);
    });
  });
  server.on('error', () => {
    findFreePort(startPort + 1, callback);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    title: "Imposter Friend"
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  findFreePort(3000, (port) => {
    process.env.PORT = port.toString();
    process.env.NODE_ENV = 'production';
    
    // Set static path to the packaged dist folder
    process.env.STATIC_PATH = path.join(__dirname, 'dist');
    
    // Load the Express server
    try {
      require('./dist-server/server.cjs');
    } catch (err) {
      console.error('Failed to load server:', err);
    }
    
    createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
