const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cpapAPI', {
  selectDataFolder: () => ipcRenderer.invoke('select-data-folder'),
  getSessionDetail: (sessionId) => ipcRenderer.invoke('get-session-detail', sessionId),
  getDailyStats: () => ipcRenderer.invoke('get-daily-stats'),
  refreshData: () => ipcRenderer.invoke('refresh-data'),
  setTimeFilter: (dayStartHour, dayEndHour) => ipcRenderer.invoke('set-time-filter', dayStartHour, dayEndHour),

  onDataLoaded: (callback) => {
    ipcRenderer.on('data-loaded', (event, data) => callback(data));
  },

  onDataError: (callback) => {
    ipcRenderer.on('data-error', (event, error) => callback(error));
  }
});
