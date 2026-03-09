const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { startServer } = require('../server');

const PROJECT_ROOT = path.join(__dirname, '..');
let mainWindow = null;
let runtimeServer = null;
let logFilePath = null;
let updateDownloaded = false;
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

function configureAutoUpdates() {
  if (!app.isPackaged) {
    writeLog('Skipping auto-update setup in development mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: message => writeLog(`Updater info: ${message}`),
    warn: message => writeLog(`Updater warn: ${message}`),
    error: message => writeLog(`Updater error: ${message}`),
  };

  autoUpdater.on('checking-for-update', () => {
    writeLog('Checking for app updates');
  });

  autoUpdater.on('update-available', info => {
    writeLog(`Update available: ${info?.version || 'unknown version'}`);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info?.version || 'latest'} is available.`,
        detail: 'The update is downloading automatically in the background.',
      }).catch(() => {});
    }
  });

  autoUpdater.on('update-not-available', info => {
    writeLog(`No update available. Current version ${info?.version || app.getVersion()}`);
  });

  autoUpdater.on('download-progress', progress => {
    const percent = Number(progress?.percent || 0).toFixed(1);
    writeLog(`Update download progress: ${percent}%`);
  });

  autoUpdater.on('update-downloaded', info => {
    writeLog(`Update downloaded: ${info?.version || 'unknown version'}`);
    updateDownloaded = true;
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Ready',
        message: `Version ${info?.version || 'latest'} has been downloaded.`,
        detail: 'Restart the app now to apply the update.',
      }).then(result => {
        if (result.response === 0) {
          writeLog('User accepted restart to install update');
          autoUpdater.quitAndInstall();
        }
      }).catch(() => {});
    }
  });

  autoUpdater.on('error', error => {
    writeLog(`Auto-update failure: ${error?.stack || error?.message || error}`);
  });
}

function scheduleAutoUpdateChecks() {
  if (!app.isPackaged) return;
  const check = () => autoUpdater.checkForUpdates().catch(error => {
    writeLog(`Update check failed: ${error?.stack || error?.message || error}`);
  });

  setTimeout(check, 15000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

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
    configureAutoUpdates();
    scheduleAutoUpdateChecks();
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
  if (updateDownloaded) return;
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
