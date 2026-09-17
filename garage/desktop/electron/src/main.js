const { app, BrowserWindow, shell, dialog, ipcMain, Notification, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

log.transports.file.level = 'info';
autoUpdater.logger = log;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const ICON = path.join(__dirname, '../../assets/icons/icon.ico');

let mainWindow;
let tray = null;
let quitting = false;

// A second copy of the admin app would open a second set of Firestore
// listeners and chime twice for every arrival. One instance, always.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Garage Management Pro',
    icon: ICON,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#f9fafb',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(process.resourcesPath, 'app', 'index.html');
    log.info('Loading from:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('firebaseapp.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 650,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing hides instead of quitting. The whole point of this app is that a
  // car arriving at the gate reaches the boss; an app that is not running
  // cannot do that, and people close windows out of habit.
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  try {
    tray = new Tray(ICON);
    tray.setToolTip('Garage Management Pro');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch (err) {
    // A missing icon must not stop the app from starting.
    log.error('Tray failed:', err);
  }
}

app.whenReady().then(() => {
  // Without this Windows shows "electron.app.Garage Management Pro" as the
  // sender on every toast instead of the app name.
  if (process.platform === 'win32') app.setAppUserModelId('com.vafubwengetech.garagemanagementpro');

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { quitting = true; });

app.on('window-all-closed', () => {
  // Deliberately does not quit on Windows: the tray keeps it alive.
  if (process.platform !== 'darwin' && quitting) app.quit();
});

// ---- notifications from the renderer --------------------------------
// The renderer runs on file:// in production, where the web Notification API
// is silently dead. Everything the desk sends comes through here instead.
ipcMain.on('notify', (_evt, payload) => {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: String(payload && payload.title || 'Smart Garage'),
      body: String(payload && payload.body || ''),
      icon: ICON,
      urgency: 'critical',
    });
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
    n.show();
    if (mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
  } catch (err) {
    log.error('Notification failed:', err);
  }
});

ipcMain.on('badge', (_evt, count) => {
  const c = Number(count) || 0;
  try {
    app.setBadgeCount(c);
    if (tray) tray.setToolTip(c > 0 ? `Garage Management Pro - ${c} unread` : 'Garage Management Pro');
    if (mainWindow && c === 0) mainWindow.flashFrame(false);
  } catch (err) {
    log.error('Badge failed:', err);
  }
});

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `Garage Management Pro v${info.version} is available.`,
    buttons: ['OK'],
  });
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: `v${info.version} ready. Restart to apply.`,
    buttons: ['Restart Now', 'Later'],
  }).then((result) => {
    if (result.response === 0) { quitting = true; autoUpdater.quitAndInstall(); }
  });
});

autoUpdater.on('error', (err) => { log.error('Auto-updater error:', err); });

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('check-update', () => autoUpdater.checkForUpdatesAndNotify());