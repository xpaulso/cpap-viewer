/**
 * CPAP Data Loader
 * Loads and organizes ResMed CPAP data from device storage
 */

const fs = require('fs');
const path = require('path');
const { parseSTRFile, parseSessionFile } = require('./edf-parser');

class CPAPDataLoader {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.deviceInfo = null;
    this.dailySummary = null;
    this.sessions = [];
    // Day boundary hours (0-23). Sessions between dayStartHour and dayEndHour (next day)
    // are grouped as one sleep night. Default: noon to noon (12:00)
    this.dayStartHour = 12;
    this.dayEndHour = 12;
  }

  /**
   * Set the day boundary for grouping sleep sessions
   * @param {number} startHour - Hour when the "day" starts (0-23)
   * @param {number} endHour - Hour when the "day" ends (0-23)
   */
  setDayBoundary(startHour, endHour) {
    this.dayStartHour = startHour;
    this.dayEndHour = endHour;
    // Recalculate sleep night usage with new boundaries
    this.sleepNightUsage = this.calculateSleepNightUsage();
  }

  /**
   * Load all CPAP data from the device
   */
  async loadAll() {
    await this.loadDeviceInfo();
    await this.loadDailySummary();
    await this.loadSessionList();
    return this.getSummary();
  }

  /**
   * Load device identification info
   */
  async loadDeviceInfo() {
    const idPath = path.join(this.dataPath, 'Identification.tgt');

    if (!fs.existsSync(idPath)) {
      this.deviceInfo = { error: 'Identification file not found' };
      return;
    }

    const content = fs.readFileSync(idPath, 'utf8');
    const info = {};

    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^#(\w+)\s+(.+)$/);
      if (match) {
        info[match[1]] = match[2].trim();
      }
    }

    // Parse known fields
    this.deviceInfo = {
      serialNumber: info.SRN || 'Unknown',
      productName: info.PNA ? info.PNA.replace(/_/g, ' ') : 'Unknown',
      productCode: info.PCD || 'Unknown',
      machineId: info.MID || 'Unknown',
      firmwareVersion: info.FGT || 'Unknown',
      raw: info
    };
  }

  /**
   * Load daily summary from STR.edf
   */
  async loadDailySummary() {
    const strPath = path.join(this.dataPath, 'STR.edf');

    if (!fs.existsSync(strPath)) {
      this.dailySummary = { error: 'STR.edf not found' };
      return;
    }

    try {
      const data = parseSTRFile(strPath);
      this.dailySummary = data;
    } catch (err) {
      this.dailySummary = { error: err.message };
    }
  }

  /**
   * Get list of all sessions from DATALOG directory
   */
  async loadSessionList() {
    const datalogPath = path.join(this.dataPath, 'DATALOG');

    if (!fs.existsSync(datalogPath)) {
      this.sessions = [];
      return;
    }

    const dateDirs = fs.readdirSync(datalogPath)
      .filter(d => /^\d{8}$/.test(d))
      .sort()
      .reverse();

    this.sessions = [];

    for (const dateDir of dateDirs) {
      const datePath = path.join(datalogPath, dateDir);
      const files = fs.readdirSync(datePath);

      // Group files by session timestamp
      const sessionMap = new Map();

      for (const file of files) {
        if (!file.endsWith('.edf')) continue;

        const match = file.match(/^(\d{8}_\d{6})_(\w+)\.edf$/);
        if (match) {
          const sessionId = match[1];
          const fileType = match[2];

          if (!sessionMap.has(sessionId)) {
            sessionMap.set(sessionId, {
              id: sessionId,
              date: dateDir,
              timestamp: this.parseSessionTimestamp(sessionId),
              files: {},
              durationMinutes: 0
            });
          }

          sessionMap.get(sessionId).files[fileType] = path.join(datePath, file);
        }
      }

      // Calculate duration for each session from BRP file
      for (const session of sessionMap.values()) {
        if (session.files.BRP) {
          session.durationMinutes = this.getSessionDuration(session.files.BRP);
        }
      }

      this.sessions.push(...sessionMap.values());
    }

    // Calculate sleep night usage (group sessions by sleep night: noon to noon)
    this.sleepNightUsage = this.calculateSleepNightUsage();
  }

  /**
   * Get session duration from BRP file header
   */
  getSessionDuration(brpFilePath) {
    try {
      const buffer = fs.readFileSync(brpFilePath);
      // Parse just the header to get duration info
      const numDataRecords = parseInt(buffer.slice(236, 244).toString('ascii').trim()) || 0;
      const dataRecordDuration = parseFloat(buffer.slice(244, 252).toString('ascii').trim()) || 0;
      return (numDataRecords * dataRecordDuration) / 60; // Convert to minutes
    } catch (e) {
      return 0;
    }
  }

  /**
   * Calculate usage per "sleep night" based on configured day boundaries
   * A sleep night starting on date X includes sessions from X dayStartHour to X+1 dayStartHour
   */
  calculateSleepNightUsage() {
    const sleepNights = new Map();

    for (const session of this.sessions) {
      if (!session.timestamp || session.durationMinutes <= 0) continue;

      // Determine the "sleep night" date based on day boundary
      // If session starts before the day boundary hour, it belongs to the previous day's sleep night
      const sessionDate = new Date(session.timestamp);
      let sleepNightDate = new Date(sessionDate);

      if (sessionDate.getHours() < this.dayStartHour) {
        // Before day boundary - belongs to previous night
        sleepNightDate.setDate(sleepNightDate.getDate() - 1);
      }

      const dateKey = sleepNightDate.toISOString().split('T')[0];

      if (!sleepNights.has(dateKey)) {
        sleepNights.set(dateKey, {
          date: dateKey,
          totalMinutes: 0,
          sessionCount: 0
        });
      }

      const night = sleepNights.get(dateKey);
      night.totalMinutes += session.durationMinutes;
      night.sessionCount++;
    }

    return sleepNights;
  }

  /**
   * Parse session timestamp from filename
   */
  parseSessionTimestamp(sessionId) {
    // Format: YYYYMMDD_HHMMSS
    const match = sessionId.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
    if (match) {
      return new Date(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6])
      );
    }
    return null;
  }

  /**
   * Load detailed session data
   */
  async loadSessionDetail(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const detail = {
      id: session.id,
      date: session.date,
      timestamp: session.timestamp,
      data: {}
    };

    // Load each file type
    for (const [fileType, filePath] of Object.entries(session.files)) {
      try {
        const parsed = parseSessionFile(filePath);
        detail.data[fileType] = {
          header: parsed.header,
          signals: parsed.signals.map(s => s.label),
          sampleCounts: Object.fromEntries(
            Object.entries(parsed.data).map(([k, v]) => [k, v.length])
          ),
          rawData: parsed.data
        };
      } catch (err) {
        detail.data[fileType] = { error: err.message };
      }
    }

    return detail;
  }

  /**
   * Get processed daily statistics
   */
  getDailyStats() {
    if (!this.dailySummary || !this.dailySummary.days) {
      return [];
    }

    return this.dailySummary.days
      .map((day, index) => {
        // Calculate the date
        const startDate = this.dailySummary.header.startDate;
        let dateStr = day._date;

        if (!dateStr && startDate) {
          const monthNames = {
            'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
            'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
          };
          const match = startDate.match(/(\d{2})-([A-Z]{3})-(\d{4})/);
          if (match) {
            const d = new Date(
              parseInt(match[3]),
              monthNames[match[2]],
              parseInt(match[1]) + index
            );
            dateStr = d.toISOString().split('T')[0];
          }
        }

        // Get accurate usage from sleep night calculation (based on actual session durations)
        // Falls back to OnDuration from STR.edf if session data not available
        const sleepNight = this.sleepNightUsage ? this.sleepNightUsage.get(dateStr) : null;
        const usageMinutes = sleepNight ? sleepNight.totalMinutes : (day['OnDuration'] || 0);

        return {
          date: dateStr || `Day ${index + 1}`,
          ahi: day['AHI'] || 0,
          ai: day['AI'] || 0,
          hi: day['HI'] || 0,
          oai: day['OAI'] || 0,
          cai: day['CAI'] || 0,
          uai: day['UAI'] || 0,
          duration: day['Duration'] || 0,
          onDuration: day['OnDuration'] || 0,
          usageHours: usageMinutes / 60,  // Accurate hours from session data
          patientHoursCumulative: day['PatientHours'] || 0,  // Renamed to clarify it's cumulative
          leak50: day['Leak.50'] || 0,
          leak95: day['Leak.95'] || 0,
          leakMax: day['Leak.Max'] || 0,
          maskPress50: day['MaskPress.50'] || 0,
          maskPress95: day['MaskPress.95'] || 0,
          respRate50: day['RespRate.50'] || 0,
          respRate95: day['RespRate.95'] || 0,
          tidVol50: day['TidVol.50'] || 0,
          tidVol95: day['TidVol.95'] || 0,
          minVent50: day['MinVent.50'] || 0,
          minVent95: day['MinVent.95'] || 0,
          csr: day['CSR'] || 0,
          rin: day['RIN'] || 0,
          mode: day['Mode'] || 0,
          pressure: day['S.C.Press'] || day['S.AS.MinPress'] || 0,
          maxPressure: day['S.AS.MaxPress'] || day['S.C.Press'] || 0,
          eprLevel: day['S.EPR.Level'] || 0,
          maskOn: day['MaskOn'] || 0,
          maskOff: day['MaskOff'] || 0,
          // SpO2 data (requires oximeter)
          spo2Avg: day['SpO2.Avg'] || day['SpO2Avg'] || day['SpO2.50'] || 0,
          spo2Min: day['SpO2.Min'] || day['SpO2Min'] || 0,
          spo2Max: day['SpO2.Max'] || day['SpO2Max'] || 0,
          pulseAvg: day['Pulse.Avg'] || day['PulseAvg'] || day['Pulse.50'] || 0,
          pulseMin: day['Pulse.Min'] || day['PulseMin'] || 0,
          pulseMax: day['Pulse.Max'] || day['PulseMax'] || 0,
          raw: day
        };
      })
      .filter(day => day.duration > 0 || day.onDuration > 0);
  }

  /**
   * Get overall summary
   */
  getSummary() {
    const stats = this.getDailyStats();
    const recentDays = stats.slice(0, 30);

    const avgAHI = recentDays.length > 0
      ? recentDays.reduce((sum, d) => sum + d.ahi, 0) / recentDays.length
      : 0;

    // usageHours already contains accurate hours from session data
    const avgUsage = recentDays.length > 0
      ? recentDays.reduce((sum, d) => sum + d.usageHours, 0) / recentDays.length
      : 0;

    const avgLeak = recentDays.length > 0
      ? recentDays.reduce((sum, d) => sum + d.leak50, 0) / recentDays.length
      : 0;

    return {
      deviceInfo: this.deviceInfo,
      totalDays: stats.length,
      recentDays: recentDays.length,
      averages: {
        ahi: avgAHI,
        usage: avgUsage,
        leak: avgLeak
      },
      dailyStats: stats,
      sessions: this.sessions.slice(0, 50) // Return last 50 sessions
    };
  }
}

module.exports = { CPAPDataLoader };
