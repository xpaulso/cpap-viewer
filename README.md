# CPAP Data Viewer

An Electron application for decoding and displaying ResMed CPAP data.

## Features

- **Device Information**: View your CPAP device details (model, serial number, firmware)
- **Daily Statistics**: AHI, usage hours, pressure, leak rates, and respiratory data
- **Interactive Charts**: Visualize trends over time with AHI, usage, and pressure/leak charts
- **Session Details**: Browse individual therapy sessions with detailed waveform data
- **Event Tracking**: View apnea, hypopnea, and other respiratory events

## Supported Devices

- ResMed AirSense 10 series
- Other ResMed devices using EDF format

## Installation

```bash
cd cpap-viewer
npm install
```

## Usage

```bash
npm start
```

The app will automatically load data from the `NO NAME` directory (your CPAP SD card) if present.

To load data from a different location, click "Open Data Folder" and select your CPAP data directory.

## Data Structure

The app expects ResMed CPAP data with:
- `STR.edf` - Summary statistics file
- `DATALOG/` - Directory containing daily session data
- `Identification.tgt` - Device identification file

## Understanding Your Data

### AHI (Apnea-Hypopnea Index)
- **< 5**: Normal/Excellent
- **5-15**: Mild
- **15-30**: Moderate
- **> 30**: Severe

### Usage
- **4+ hours**: Good compliance (meets insurance requirements)
- **< 4 hours**: May need adjustment

### Leak Rate
- Normal: < 24 L/min
- High leak can indicate mask fit issues

## Development

Built with:
- Electron 28
- Chart.js 4.4
- Custom EDF parser for medical data format

## License

MIT
