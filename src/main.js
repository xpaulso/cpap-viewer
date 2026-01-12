const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { CPAPDataLoader } = require('./cpap-data-loader');

let mainWindow;
let currentDataPath = null;
let dataLoader = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Auto-load data from NO NAME directory if it exists
  const defaultPath = path.join(__dirname, '..', '..', 'NO NAME');
  if (fs.existsSync(defaultPath) && fs.existsSync(path.join(defaultPath, 'STR.edf'))) {
    currentDataPath = defaultPath;
    loadDataFromPath(defaultPath);
  }
}

async function loadDataFromPath(dataPath) {
  try {
    dataLoader = new CPAPDataLoader(dataPath);
    const summary = await dataLoader.loadAll();
    mainWindow.webContents.send('data-loaded', summary);
  } catch (err) {
    mainWindow.webContents.send('data-error', err.message);
  }
}

// IPC Handlers
ipcMain.handle('select-data-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select CPAP Data Directory'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const strPath = path.join(selectedPath, 'STR.edf');

    if (fs.existsSync(strPath)) {
      currentDataPath = selectedPath;
      await loadDataFromPath(selectedPath);
      return { success: true, path: selectedPath };
    } else {
      return { success: false, error: 'Invalid CPAP data directory. STR.edf not found.' };
    }
  }
  return { success: false, error: 'No directory selected' };
});

ipcMain.handle('get-session-detail', async (event, sessionId) => {
  if (!dataLoader) {
    return { error: 'No data loaded' };
  }
  return await dataLoader.loadSessionDetail(sessionId);
});

ipcMain.handle('get-daily-stats', async () => {
  if (!dataLoader) {
    return { error: 'No data loaded' };
  }
  return dataLoader.getDailyStats();
});

ipcMain.handle('refresh-data', async () => {
  if (currentDataPath) {
    await loadDataFromPath(currentDataPath);
    return { success: true };
  }
  return { success: false, error: 'No data path set' };
});

ipcMain.handle('set-time-filter', async (event, dayStartHour, dayEndHour) => {
  if (!dataLoader) {
    return { error: 'No data loaded' };
  }

  // Update the time filter and recalculate
  dataLoader.setDayBoundary(dayStartHour, dayEndHour);
  const summary = dataLoader.getSummary();
  mainWindow.webContents.send('data-loaded', summary);
  return { success: true };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
