/**
 * EDF (European Data Format) Parser for CPAP data
 * Parses .edf files commonly used by ResMed CPAP machines
 */

const fs = require('fs');
const path = require('path');

class EDFParser {
  constructor() {
    this.header = null;
    this.signals = [];
    this.data = {};
  }

  /**
   * Parse an EDF file
   * @param {string} filePath - Path to the EDF file
   * @returns {Object} Parsed EDF data
   */
  parse(filePath) {
    const buffer = fs.readFileSync(filePath);
    return this.parseBuffer(buffer);
  }

  /**
   * Parse EDF data from a buffer
   * @param {Buffer} buffer - Buffer containing EDF data
   * @returns {Object} Parsed EDF data
   */
  parseBuffer(buffer) {
    this.header = this.parseHeader(buffer);
    this.signals = this.parseSignalHeaders(buffer);
    this.data = this.parseDataRecords(buffer);

    return {
      header: this.header,
      signals: this.signals,
      data: this.data
    };
  }

  /**
   * Parse the main EDF header (first 256 bytes)
   */
  parseHeader(buffer) {
    const getString = (start, length) => {
      return buffer.slice(start, start + length).toString('ascii').trim();
    };

    const getInt = (start, length) => {
      return parseInt(getString(start, length), 10) || 0;
    };

    const getFloat = (start, length) => {
      return parseFloat(getString(start, length)) || 0;
    };

    return {
      version: getString(0, 8),
      patientId: getString(8, 80),
      recordingId: getString(88, 80),
      startDate: getString(168, 8),
      startTime: getString(176, 8),
      headerBytes: getInt(184, 8),
      reserved: getString(192, 44),
      numDataRecords: getInt(236, 8),
      dataRecordDuration: getFloat(244, 8),
      numSignals: getInt(252, 4)
    };
  }

  /**
   * Parse signal headers (variable length, depends on number of signals)
   */
  parseSignalHeaders(buffer) {
    const numSignals = this.header.numSignals;
    const signals = [];
    let offset = 256;

    const readField = (length) => {
      const values = [];
      for (let i = 0; i < numSignals; i++) {
        values.push(buffer.slice(offset + i * length, offset + (i + 1) * length).toString('ascii').trim());
      }
      offset += numSignals * length;
      return values;
    };

    const labels = readField(16);
    const transducerTypes = readField(80);
    const physicalDimensions = readField(8);
    const physicalMinimums = readField(8);
    const physicalMaximums = readField(8);
    const digitalMinimums = readField(8);
    const digitalMaximums = readField(8);
    const prefiltering = readField(80);
    const samplesPerRecord = readField(8);
    const reserved = readField(32);

    for (let i = 0; i < numSignals; i++) {
      signals.push({
        label: labels[i],
        transducerType: transducerTypes[i],
        physicalDimension: physicalDimensions[i],
        physicalMinimum: parseFloat(physicalMinimums[i]) || 0,
        physicalMaximum: parseFloat(physicalMaximums[i]) || 0,
        digitalMinimum: parseInt(digitalMinimums[i], 10) || 0,
        digitalMaximum: parseInt(digitalMaximums[i], 10) || 0,
        prefiltering: prefiltering[i],
        samplesPerRecord: parseInt(samplesPerRecord[i], 10) || 0,
        reserved: reserved[i]
      });
    }

    return signals;
  }

  /**
   * Parse data records
   */
  parseDataRecords(buffer) {
    const dataOffset = this.header.headerBytes;
    const numRecords = this.header.numDataRecords;
    const data = {};

    // Initialize arrays for each signal
    for (const signal of this.signals) {
      data[signal.label] = [];
    }

    // Calculate samples per record for each signal
    const samplesPerRecord = this.signals.map(s => s.samplesPerRecord);
    const totalSamplesPerRecord = samplesPerRecord.reduce((a, b) => a + b, 0);
    const bytesPerRecord = totalSamplesPerRecord * 2; // 2 bytes per sample (16-bit)

    let offset = dataOffset;

    for (let rec = 0; rec < numRecords && offset < buffer.length; rec++) {
      for (let sig = 0; sig < this.signals.length; sig++) {
        const signal = this.signals[sig];
        const numSamples = signal.samplesPerRecord;

        for (let samp = 0; samp < numSamples && offset + 1 < buffer.length; samp++) {
          // Read 16-bit signed integer (little-endian)
          const digitalValue = buffer.readInt16LE(offset);
          offset += 2;

          // Convert digital to physical value
          const physicalValue = this.digitalToPhysical(digitalValue, signal);
          data[signal.label].push(physicalValue);
        }
      }
    }

    return data;
  }

  /**
   * Convert digital value to physical value
   */
  digitalToPhysical(digital, signal) {
    const { physicalMinimum, physicalMaximum, digitalMinimum, digitalMaximum } = signal;

    if (digitalMaximum === digitalMinimum) return digital;

    const scale = (physicalMaximum - physicalMinimum) / (digitalMaximum - digitalMinimum);
    return physicalMinimum + (digital - digitalMinimum) * scale;
  }
}

/**
 * Parse the STR.edf summary file which contains daily statistics
 */
function parseSTRFile(filePath) {
  const parser = new EDFParser();
  const result = parser.parse(filePath);

  // STR file contains one record per day
  const days = [];
  const numDays = result.header.numDataRecords;

  for (let i = 0; i < numDays; i++) {
    const day = {};

    for (const [label, values] of Object.entries(result.data)) {
      if (values[i] !== undefined) {
        day[label] = values[i];
      }
    }

    // Parse date from the Date field if available
    if (day['Date'] !== undefined) {
      const dateValue = day['Date'];
      // Date is stored as days since some epoch, convert to actual date
      const startDate = parseEDFDate(result.header.startDate);
      if (startDate) {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + i);
        day['_date'] = dayDate.toISOString().split('T')[0];
      }
    }

    days.push(day);
  }

  return {
    header: result.header,
    signals: result.signals,
    days: days
  };
}

/**
 * Parse EDF date format (DD.MM.YY or DD-MMM-YYYY)
 */
function parseEDFDate(dateStr) {
  if (!dateStr) return null;

  // Try DD-MMM-YYYY format (e.g., "30-NOV-2024")
  const monthNames = {
    'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
    'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
  };

  const match = dateStr.match(/(\d{2})-([A-Z]{3})-(\d{4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = monthNames[match[2]];
    const year = parseInt(match[3], 10);
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Try DD.MM.YY format
  const match2 = dateStr.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (match2) {
    const day = parseInt(match2[1], 10);
    const month = parseInt(match2[2], 10) - 1;
    let year = parseInt(match2[3], 10);
    year += year < 80 ? 2000 : 1900;
    return new Date(year, month, day);
  }

  return null;
}

/**
 * Parse session detail files (BRP, PLD, SAD, EVE, CSL)
 */
function parseSessionFile(filePath) {
  const parser = new EDFParser();
  return parser.parse(filePath);
}

module.exports = {
  EDFParser,
  parseSTRFile,
  parseSessionFile,
  parseEDFDate
};
