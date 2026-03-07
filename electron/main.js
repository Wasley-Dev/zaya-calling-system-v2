const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, dialog } = require('electron');
const { startServer } = require('../server');

const PROJECT_ROOT = path.join(__dirname, '..');
let mainWindow = null;
let runtimeServer = null;
let logFilePath = null;
const bootLogPath = path.join(os.tmpdir(), 'zaya-calling-system-boot.log');

function writeLog(message) {
  try {
    fs.appendFileSync(bootLogPath, `[${new Date().toISOString()}] ${message}\n`);
    if (!logFilePath) {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      logFilePath = path.join(logsDir, 'main.log');
    }
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {
    // Ignore logging failures.
  }
}

writeLog('Main process module loaded');

async function createMainWindow() {
  const runtimeRoot = path.join(app.getPath('userData'), 'runtime');
  writeLog(`Starting desktop app with runtime root: ${runtimeRoot}`);

  try {
    const { port, server } = await startServer({
      port: 0,
      host: '127.0.0.1',
      projectRoot: PROJECT_ROOT,
      runtimeRoot,
    });

    runtimeServer = server;
    writeLog(`Embedded server started on port ${port}`);
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1100,
      minHeight: 720,
      show: false,
      backgroundColor: '#0f172a',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => {
      writeLog('Main window closed');
      mainWindow = null;
    });

    writeLog(`Loading UI from http://127.0.0.1:${port}`);
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
    writeLog('UI loaded successfully');
  } catch (error) {
    writeLog(`Startup failure: ${error.stack || error.message}`);
    dialog.showErrorBox('Zaya Calling System', error.message);
    app.quit();
  }
}

function closeRuntimeServer() {
  if (!runtimeServer) return Promise.resolve();

  return new Promise(resolve => {
    runtimeServer.close(() => {
      runtimeServer = null;
      resolve();
    });
  });
}

app.whenReady().then(createMainWindow);

app.on('ready', () => {
  writeLog('Electron ready event fired');
});

process.on('uncaughtException', error => {
  writeLog(`Uncaught exception: ${error.stack || error.message}`);
});

process.on('unhandledRejection', error => {
  writeLog(`Unhandled rejection: ${error?.stack || error}`);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', async event => {
  if (!runtimeServer) return;
  event.preventDefault();
  await closeRuntimeServer();
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
