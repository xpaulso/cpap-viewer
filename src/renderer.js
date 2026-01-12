// CPAP Data Viewer - Renderer Process

let currentData = null;
let daysToShow = 30; // Default number of days to display
let charts = {
  ahi: null,
  usage: null,
  pressureLeak: null
};

// DOM Elements
const welcomeScreen = document.getElementById('welcomeScreen');
const dashboard = document.getElementById('dashboard');
const refreshBtn = document.getElementById('refreshBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const openFolderBtn2 = document.getElementById('openFolderBtn2');
const deviceDetails = document.getElementById('deviceDetails');
const statsGrid = document.getElementById('statsGrid');
const historyTableBody = document.getElementById('historyTableBody');
const sessionsTableBody = document.getElementById('sessionsTableBody');
const sessionModal = document.getElementById('sessionModal');
const sessionModalBody = document.getElementById('sessionModalBody');
const closeModal = document.getElementById('closeModal');

// Tab handling
const tabs = document.querySelectorAll('.tab');
const overviewTab = document.getElementById('overviewTab');
const historyTab = document.getElementById('historyTab');
const sessionsTab = document.getElementById('sessionsTab');

// Time filter elements
const dayStartTime = document.getElementById('dayStartTime');
const dayEndTime = document.getElementById('dayEndTime');
const applyTimeFilter = document.getElementById('applyTimeFilter');
const daysToShowSelect = document.getElementById('daysToShow');

// Event Listeners
openFolderBtn.addEventListener('click', selectDataFolder);
openFolderBtn2.addEventListener('click', selectDataFolder);
refreshBtn.addEventListener('click', refreshData);
closeModal.addEventListener('click', () => sessionModal.classList.remove('active'));

// Time filter handler
applyTimeFilter.addEventListener('click', async () => {
  const startTime = dayStartTime.value; // Format: "HH:MM"
  const endTime = dayEndTime.value;

  // Parse hours from time strings
  const startHour = parseInt(startTime.split(':')[0], 10);
  const endHour = parseInt(endTime.split(':')[0], 10);

  applyTimeFilter.textContent = 'Applying...';
  applyTimeFilter.disabled = true;

  try {
    await window.cpapAPI.setTimeFilter(startHour, endHour);
  } catch (err) {
    console.error('Error applying time filter:', err);
  } finally {
    applyTimeFilter.textContent = 'Apply';
    applyTimeFilter.disabled = false;
  }
});

// Days to show selector handler
daysToShowSelect.addEventListener('change', () => {
  daysToShow = parseInt(daysToShowSelect.value, 10);
  if (currentData) {
    // Re-render charts and tables with new day count
    renderStats(currentData);
    renderCharts(currentData.dailyStats);
    renderHistoryTable(currentData.dailyStats);
  }
});

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const tabName = tab.dataset.tab;
    overviewTab.style.display = tabName === 'overview' ? 'block' : 'none';
    historyTab.style.display = tabName === 'history' ? 'block' : 'none';
    sessionsTab.style.display = tabName === 'sessions' ? 'block' : 'none';
  });
});

// API listeners
window.cpapAPI.onDataLoaded((data) => {
  currentData = data;
  showDashboard(data);
});

window.cpapAPI.onDataError((error) => {
  console.error('Data error:', error);
  alert('Error loading data: ' + error);
});

async function selectDataFolder() {
  const result = await window.cpapAPI.selectDataFolder();
  if (!result.success) {
    if (result.error !== 'No directory selected') {
      alert(result.error);
    }
  }
}

async function refreshData() {
  const result = await window.cpapAPI.refreshData();
  if (!result.success) {
    alert('Error refreshing data: ' + result.error);
  }
}

function showDashboard(data) {
  welcomeScreen.style.display = 'none';
  dashboard.style.display = 'block';
  refreshBtn.style.display = 'inline-block';

  renderDeviceInfo(data.deviceInfo);
  renderStats(data);
  renderCharts(data.dailyStats);
  renderHistoryTable(data.dailyStats);
  renderSessionsTable(data.sessions);
}

function renderDeviceInfo(info) {
  if (!info || info.error) {
    deviceDetails.innerHTML = '<p>Device information not available</p>';
    return;
  }

  deviceDetails.innerHTML = `
    <div class="device-detail">
      <label>Device</label>
      <span>${info.productName}</span>
    </div>
    <div class="device-detail">
      <label>Serial Number</label>
      <span>${info.serialNumber}</span>
    </div>
    <div class="device-detail">
      <label>Firmware</label>
      <span>${info.firmwareVersion}</span>
    </div>
    <div class="device-detail">
      <label>Product Code</label>
      <span>${info.productCode}</span>
    </div>
  `;
}

function renderStats(data) {
  // Calculate averages based on selected days to show
  const displayDays = daysToShow === 0 ? data.dailyStats.length : Math.min(daysToShow, data.dailyStats.length);
  const recentDays = data.dailyStats.slice(0, displayDays);

  const avgAHI = recentDays.length > 0
    ? recentDays.reduce((sum, d) => sum + (d.ahi || 0), 0) / recentDays.length
    : 0;
  const avgUsage = recentDays.length > 0
    ? recentDays.reduce((sum, d) => sum + (d.usageHours || 0), 0) / recentDays.length
    : 0;
  // Use leak95 (95th percentile) as it's more meaningful; fallback to leak50
  const avgLeak = recentDays.length > 0
    ? recentDays.reduce((sum, d) => sum + (d.leak95 || d.leak50 || 0), 0) / recentDays.length
    : 0;
  // Average pressure using 95th percentile mask pressure
  const avgPressure = recentDays.length > 0
    ? recentDays.reduce((sum, d) => sum + (d.maskPress95 || d.maskPress50 || 0), 0) / recentDays.length
    : 0;

  const ahiClass = avgAHI < 5 ? 'good' : avgAHI < 15 ? 'warning' : 'bad';
  const usageClass = avgUsage >= 4 ? 'good' : avgUsage >= 2 ? 'warning' : 'bad';
  const leakClass = avgLeak < 24 ? 'good' : avgLeak < 36 ? 'warning' : 'bad';
  const daysLabel = daysToShow === 0 ? 'all' : displayDays;

  statsGrid.innerHTML = `
    <div class="stat-card ${ahiClass}">
      <h3>Average AHI</h3>
      <div class="value">${avgAHI.toFixed(1)}<span class="unit">events/hr</span></div>
      <div class="subtitle">Last ${daysLabel} days</div>
    </div>
    <div class="stat-card ${usageClass}">
      <h3>Average Usage</h3>
      <div class="value">${avgUsage.toFixed(1)}<span class="unit">hours</span></div>
      <div class="subtitle">Per night</div>
    </div>
    <div class="stat-card">
      <h3>Average Pressure</h3>
      <div class="value">${avgPressure.toFixed(1)}<span class="unit">cmH2O</span></div>
      <div class="subtitle">95th percentile</div>
    </div>
    <div class="stat-card ${leakClass}">
      <h3>Average Leak</h3>
      <div class="value">${avgLeak.toFixed(1)}<span class="unit">L/min</span></div>
      <div class="subtitle">95th percentile</div>
    </div>
    <div class="stat-card">
      <h3>Total Days</h3>
      <div class="value">${data.totalDays}</div>
      <div class="subtitle">Days of data</div>
    </div>
  `;
}

function renderCharts(dailyStats) {
  // Use selected number of days (0 = all data)
  const numDays = daysToShow === 0 ? dailyStats.length : Math.min(daysToShow, dailyStats.length);
  const selectedDays = dailyStats.slice(0, numDays).reverse();

  const labels = selectedDays.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  // Destroy existing charts
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy();
  });

  // AHI Chart
  const ahiCtx = document.getElementById('ahiChart').getContext('2d');
  charts.ahi = new Chart(ahiCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'AHI',
          data: selectedDays.map(d => d.ahi),
          borderColor: '#4361ee',
          backgroundColor: 'rgba(67, 97, 238, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Hypopneas',
          data: selectedDays.map(d => d.hi),
          borderColor: '#9b59b6',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        },
        {
          label: 'Apneas',
          data: selectedDays.map(d => d.ai),
          borderColor: '#e74c3c',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        }
      ]
    },
    options: getChartOptions('Events per Hour')
  });

  // Usage Chart
  const usageCtx = document.getElementById('usageChart').getContext('2d');
  charts.usage = new Chart(usageCtx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Usage Hours',
        data: selectedDays.map(d => d.usageHours),
        backgroundColor: selectedDays.map(d => {
          return d.usageHours >= 4 ? 'rgba(46, 204, 113, 0.7)' :
                 d.usageHours >= 2 ? 'rgba(241, 196, 15, 0.7)' :
                 'rgba(231, 76, 60, 0.7)';
        }),
        borderRadius: 4
      }]
    },
    options: {
      ...getChartOptions('Hours'),
      plugins: {
        ...getChartOptions('Hours').plugins,
        annotation: {
          annotations: {
            line1: {
              type: 'line',
              yMin: 4,
              yMax: 4,
              borderColor: 'rgba(46, 204, 113, 0.5)',
              borderWidth: 2,
              borderDash: [5, 5]
            }
          }
        }
      }
    }
  });

  // Pressure/Leak Chart
  const plCtx = document.getElementById('pressureLeakChart').getContext('2d');
  charts.pressureLeak = new Chart(plCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Pressure (95%)',
          data: selectedDays.map(d => d.maskPress95),
          borderColor: '#3498db',
          backgroundColor: 'transparent',
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Leak (95%)',
          data: selectedDays.map(d => d.leak95),
          borderColor: '#e67e22',
          backgroundColor: 'transparent',
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: { color: '#a0a0a0' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#a0a0a0' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Pressure (cmH2O)',
            color: '#a0a0a0'
          },
          ticks: { color: '#a0a0a0' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Leak (L/min)',
            color: '#a0a0a0'
          },
          ticks: { color: '#a0a0a0' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function getChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        labels: { color: '#a0a0a0' }
      }
    },
    scales: {
      x: {
        ticks: { color: '#a0a0a0' },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      y: {
        title: {
          display: true,
          text: yLabel,
          color: '#a0a0a0'
        },
        ticks: { color: '#a0a0a0' },
        grid: { color: 'rgba(255,255,255,0.05)' }
      }
    }
  };
}

function renderHistoryTable(dailyStats) {
  // Use selected number of days (0 = all data)
  const numDays = daysToShow === 0 ? dailyStats.length : Math.min(daysToShow, dailyStats.length);
  historyTableBody.innerHTML = dailyStats.slice(0, numDays).map(day => {
    const ahiClass = getAHIClass(day.ahi);

    return `
      <tr>
        <td>${formatDate(day.date)}</td>
        <td><span class="ahi-badge ${ahiClass}">${day.ahi.toFixed(1)}</span></td>
        <td>${day.usageHours.toFixed(1)} hrs</td>
        <td>${day.maskPress95.toFixed(1)} cmH2O</td>
        <td>${day.leak95.toFixed(0)} L/min</td>
        <td>${day.respRate50.toFixed(0)} /min</td>
        <td>
          OA: ${day.oai.toFixed(1)} |
          CA: ${day.cai.toFixed(1)} |
          H: ${day.hi.toFixed(1)}
        </td>
      </tr>
    `;
  }).join('');
}

function renderSessionsTable(sessions) {
  sessionsTableBody.innerHTML = sessions.map(session => {
    const fileTypes = Object.keys(session.files).join(', ');
    const timestamp = session.timestamp ?
      session.timestamp.toLocaleString() :
      session.id;

    return `
      <tr>
        <td>${timestamp}</td>
        <td>${fileTypes}</td>
        <td>
          <button class="btn" onclick="viewSession('${session.id}')">View Details</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function viewSession(sessionId) {
  sessionModal.classList.add('active');
  sessionModalBody.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const detail = await window.cpapAPI.getSessionDetail(sessionId);

    if (detail.error) {
      sessionModalBody.innerHTML = `<p>Error: ${detail.error}</p>`;
      return;
    }

    let html = `
      <p><strong>Session:</strong> ${detail.id}</p>
      <p><strong>Date:</strong> ${detail.timestamp ? detail.timestamp.toLocaleString() : detail.date}</p>
      <hr style="border-color: var(--border-color); margin: 16px 0;">
    `;

    for (const [fileType, fileData] of Object.entries(detail.data)) {
      html += `
        <div style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 8px;">${getFileTypeName(fileType)}</h4>
      `;

      if (fileData.error) {
        html += `<p style="color: var(--accent-red);">Error: ${fileData.error}</p>`;
      } else {
        html += `
          <p><strong>Signals:</strong> ${fileData.signals.join(', ')}</p>
          <p><strong>Samples:</strong></p>
          <ul style="margin-left: 20px;">
        `;
        for (const [signal, count] of Object.entries(fileData.sampleCounts)) {
          html += `<li>${signal}: ${count.toLocaleString()} samples</li>`;
        }
        html += '</ul>';

        // Show mini chart for breathing data
        if (fileType === 'BRP' && fileData.rawData) {
          html += `<div style="margin-top: 16px;"><canvas id="sessionChart_${fileType}" height="150"></canvas></div>`;
        }
      }

      html += '</div>';
    }

    sessionModalBody.innerHTML = html;

    // Render session charts
    for (const [fileType, fileData] of Object.entries(detail.data)) {
      if (fileType === 'BRP' && fileData.rawData) {
        const canvas = document.getElementById(`sessionChart_${fileType}`);
        if (canvas) {
          renderSessionChart(canvas, fileData);
        }
      }
    }
  } catch (err) {
    sessionModalBody.innerHTML = `<p>Error loading session: ${err.message}</p>`;
  }
}

function renderSessionChart(canvas, fileData) {
  const ctx = canvas.getContext('2d');

  // Get first signal with data
  const signalName = Object.keys(fileData.rawData).find(k =>
    fileData.rawData[k] && fileData.rawData[k].length > 0
  );

  if (!signalName) return;

  // Downsample for display (show ~1000 points)
  const data = fileData.rawData[signalName];
  const step = Math.max(1, Math.floor(data.length / 1000));
  const sampledData = [];
  const labels = [];

  for (let i = 0; i < data.length; i += step) {
    sampledData.push(data[i]);
    labels.push(i);
  }

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: signalName,
        data: sampledData,
        borderColor: '#4361ee',
        borderWidth: 1,
        pointRadius: 0,
        tension: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#a0a0a0' }
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          ticks: { color: '#a0a0a0' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

function getFileTypeName(fileType) {
  const names = {
    'BRP': 'Breathing/Pressure Waveform',
    'PLD': 'Pressure/Leak Data',
    'SAD': 'SpO2/Additional Data',
    'EVE': 'Events (Apneas/Hypopneas)',
    'CSL': 'Session Log'
  };
  return names[fileType] || fileType;
}

function getAHIClass(ahi) {
  if (ahi < 5) return 'excellent';
  if (ahi < 15) return 'good';
  if (ahi < 30) return 'moderate';
  return 'severe';
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Expose viewSession to global scope for onclick handlers
window.viewSession = viewSession;
