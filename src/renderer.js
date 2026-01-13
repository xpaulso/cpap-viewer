// CPAP Data Viewer - Renderer Process

let currentData = null;
let daysToShow = 30; // Default number of days to display
let customDateRange = null; // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } or null
let charts = {
  ahi: null,
  usage: null,
  pressureLeak: null,
  flowRate: null,
  tidalVolume: null,
  spo2: null,
  pulse: null
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
const dayModal = document.getElementById('dayModal');
const dayModalTitle = document.getElementById('dayModalTitle');
const dayModalBody = document.getElementById('dayModalBody');
const closeDayModal = document.getElementById('closeDayModal');

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
const dateRangeGroup = document.getElementById('dateRangeGroup');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const applyDateRangeBtn = document.getElementById('applyDateRange');

// Event Listeners
openFolderBtn.addEventListener('click', selectDataFolder);
openFolderBtn2.addEventListener('click', selectDataFolder);
refreshBtn.addEventListener('click', refreshData);
closeModal.addEventListener('click', () => sessionModal.classList.remove('active'));
closeDayModal.addEventListener('click', () => dayModal.classList.remove('active'));

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
  const value = daysToShowSelect.value;

  if (value === 'custom') {
    // Show date range inputs
    dateRangeGroup.style.display = 'flex';
    // Set default dates if not set
    if (currentData && currentData.dailyStats.length > 0) {
      const stats = currentData.dailyStats;
      if (!endDateInput.value) {
        endDateInput.value = stats[0].date; // Most recent
      }
      if (!startDateInput.value) {
        // Default to 30 days before end date
        const endDate = new Date(endDateInput.value);
        endDate.setDate(endDate.getDate() - 30);
        startDateInput.value = endDate.toISOString().split('T')[0];
      }
    }
  } else {
    // Hide date range inputs and use preset days
    dateRangeGroup.style.display = 'none';
    customDateRange = null;
    daysToShow = parseInt(value, 10);
    if (currentData) {
      renderStats(currentData);
      renderCharts(currentData.dailyStats);
      renderHistoryTable(currentData.dailyStats);
    }
  }
});

// Apply custom date range handler
applyDateRangeBtn.addEventListener('click', () => {
  const startDate = startDateInput.value;
  const endDate = endDateInput.value;

  if (!startDate || !endDate) {
    alert('Please select both start and end dates');
    return;
  }

  if (startDate > endDate) {
    alert('Start date must be before end date');
    return;
  }

  customDateRange = { start: startDate, end: endDate };
  daysToShow = -1; // Signal to use custom range

  if (currentData) {
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

/**
 * Get filtered daily stats based on current selection (days or custom date range)
 */
function getFilteredDailyStats(dailyStats) {
  if (customDateRange) {
    // Filter by custom date range
    return dailyStats.filter(d => d.date >= customDateRange.start && d.date <= customDateRange.end);
  } else if (daysToShow === 0) {
    // All data
    return dailyStats;
  } else {
    // Most recent N days
    return dailyStats.slice(0, daysToShow);
  }
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
  const recentDays = getFilteredDailyStats(data.dailyStats);
  const displayDays = recentDays.length;

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
  // Average flow rate (minute ventilation) using 95th percentile
  const avgFlowRate = recentDays.length > 0
    ? recentDays.reduce((sum, d) => sum + (d.minVent95 || d.minVent50 || 0), 0) / recentDays.length
    : 0;
  // Average tidal volume using 95th percentile
  const avgTidalVolume = recentDays.length > 0
    ? recentDays.reduce((sum, d) => sum + (d.tidVol95 || d.tidVol50 || 0), 0) / recentDays.length
    : 0;
  // Average SpO2 (only if oximeter data available)
  const daysWithSpO2 = recentDays.filter(d => d.spo2Avg > 0);
  const avgSpO2 = daysWithSpO2.length > 0
    ? daysWithSpO2.reduce((sum, d) => sum + d.spo2Avg, 0) / daysWithSpO2.length
    : 0;
  // Average Pulse (only if oximeter data available)
  const daysWithPulse = recentDays.filter(d => d.pulseAvg > 0);
  const avgPulse = daysWithPulse.length > 0
    ? daysWithPulse.reduce((sum, d) => sum + d.pulseAvg, 0) / daysWithPulse.length
    : 0;

  const ahiClass = avgAHI < 5 ? 'good' : avgAHI < 15 ? 'warning' : 'bad';
  const usageClass = avgUsage >= 4 ? 'good' : avgUsage >= 2 ? 'warning' : 'bad';
  const leakClass = avgLeak < 24 ? 'good' : avgLeak < 36 ? 'warning' : 'bad';
  // Flow rate (minute ventilation): 5-10 L/min is normal, <4 or >12 is concerning
  const flowRateClass = (avgFlowRate >= 5 && avgFlowRate <= 10) ? 'good' :
                        (avgFlowRate >= 4 && avgFlowRate <= 12) ? 'warning' : 'bad';
  // Tidal volume: 400-600 mL is normal for adults
  const tidalVolumeClass = (avgTidalVolume >= 400 && avgTidalVolume <= 600) ? 'good' :
                           (avgTidalVolume >= 300 && avgTidalVolume <= 700) ? 'warning' : 'bad';
  // SpO2: 95-100% is normal, 90-94% is concerning, <90% is bad
  const spo2Class = avgSpO2 >= 95 ? 'good' : avgSpO2 >= 90 ? 'warning' : avgSpO2 > 0 ? 'bad' : '';
  // Pulse: 60-100 bpm is normal resting heart rate
  const pulseClass = (avgPulse >= 50 && avgPulse <= 100) ? 'good' :
                     (avgPulse >= 40 && avgPulse <= 110) ? 'warning' : avgPulse > 0 ? 'bad' : '';
  const daysLabel = customDateRange ? displayDays : (daysToShow === 0 ? 'all' : displayDays);

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
    <div class="stat-card ${flowRateClass}">
      <h3>Average Flow Rate</h3>
      <div class="value">${avgFlowRate.toFixed(1)}<span class="unit">L/min</span></div>
      <div class="subtitle">95th percentile</div>
    </div>
    <div class="stat-card ${tidalVolumeClass}">
      <h3>Average Tidal Volume</h3>
      <div class="value">${avgTidalVolume.toFixed(0)}<span class="unit">mL</span></div>
      <div class="subtitle">95th percentile</div>
    </div>
    ${avgSpO2 > 0 ? `
    <div class="stat-card ${spo2Class}">
      <h3>Average SpO2</h3>
      <div class="value">${avgSpO2.toFixed(1)}<span class="unit">%</span></div>
      <div class="subtitle">${daysWithSpO2.length} days with data</div>
    </div>
    ` : ''}
    ${avgPulse > 0 ? `
    <div class="stat-card ${pulseClass}">
      <h3>Average Pulse</h3>
      <div class="value">${avgPulse.toFixed(0)}<span class="unit">bpm</span></div>
      <div class="subtitle">${daysWithPulse.length} days with data</div>
    </div>
    ` : ''}
    <div class="stat-card">
      <h3>Total Days</h3>
      <div class="value">${data.totalDays}</div>
      <div class="subtitle">Days of data</div>
    </div>
  `;
}

function renderCharts(dailyStats) {
  // Get filtered days and sort by date ascending (oldest to newest, left to right)
  const selectedDays = getFilteredDailyStats(dailyStats).sort((a, b) => {
    return a.date.localeCompare(b.date);
  });

  const labels = selectedDays.map(d => {
    // Parse date string manually to avoid timezone issues
    // d.date format is "YYYY-MM-DD"
    const [year, month, day] = d.date.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    const shortYear = year.toString().slice(-2);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + " '" + shortYear;
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
    options: getChartOptions('Events per Hour', selectedDays)
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
      ...getChartOptions('Hours', selectedDays),
      plugins: {
        ...getChartOptions('Hours', selectedDays).plugins,
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
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const day = selectedDays[index];
          if (day && day.date) {
            showDayDetail(day.date);
          }
        }
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

  // Flow Rate Chart (Minute Ventilation & Respiratory Rate)
  const frCtx = document.getElementById('flowRateChart').getContext('2d');
  charts.flowRate = new Chart(frCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Minute Ventilation (95%)',
          data: selectedDays.map(d => d.minVent95),
          borderColor: '#2ecc71',
          backgroundColor: 'rgba(46, 204, 113, 0.1)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Respiratory Rate (50%)',
          data: selectedDays.map(d => d.respRate50),
          borderColor: '#9b59b6',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
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
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const day = selectedDays[index];
          if (day && day.date) {
            showDayDetail(day.date);
          }
        }
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
            text: 'Minute Ventilation (L/min)',
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
            text: 'Resp Rate (/min)',
            color: '#a0a0a0'
          },
          ticks: { color: '#a0a0a0' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  // Tidal Volume Chart
  const tvCtx = document.getElementById('tidalVolumeChart').getContext('2d');
  charts.tidalVolume = new Chart(tvCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Tidal Volume (95%)',
          data: selectedDays.map(d => d.tidVol95),
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Tidal Volume (50%)',
          data: selectedDays.map(d => d.tidVol50),
          borderColor: '#c0392b',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        }
      ]
    },
    options: getChartOptions('Tidal Volume (mL)', selectedDays)
  });

  // SpO2 Chart
  const spo2Ctx = document.getElementById('spo2Chart').getContext('2d');
  const hasSpO2Data = selectedDays.some(d => d.spo2Avg > 0 || d.spo2Min > 0);

  charts.spo2 = new Chart(spo2Ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: hasSpO2Data ? [
        {
          label: 'SpO2 Average',
          data: selectedDays.map(d => d.spo2Avg || null),
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'SpO2 Minimum',
          data: selectedDays.map(d => d.spo2Min || null),
          borderColor: '#e74c3c',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        }
      ] : [{
        label: 'No SpO2 Data',
        data: selectedDays.map(() => null),
        borderColor: '#666',
        backgroundColor: 'transparent'
      }]
    },
    options: {
      ...getChartOptions('SpO2 (%)', selectedDays),
      scales: {
        ...getChartOptions('SpO2 (%)', selectedDays).scales,
        y: {
          ...getChartOptions('SpO2 (%)', selectedDays).scales.y,
          min: hasSpO2Data ? 85 : 0,
          max: hasSpO2Data ? 100 : 100
        }
      }
    }
  });

  // Pulse Rate Chart
  const pulseCtx = document.getElementById('pulseChart').getContext('2d');
  const hasPulseData = selectedDays.some(d => d.pulseAvg > 0 || d.pulseMin > 0);

  charts.pulse = new Chart(pulseCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: hasPulseData ? [
        {
          label: 'Pulse Average',
          data: selectedDays.map(d => d.pulseAvg || null),
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Pulse Min',
          data: selectedDays.map(d => d.pulseMin || null),
          borderColor: '#3498db',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        },
        {
          label: 'Pulse Max',
          data: selectedDays.map(d => d.pulseMax || null),
          borderColor: '#e67e22',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        }
      ] : [{
        label: 'No Pulse Data',
        data: selectedDays.map(() => null),
        borderColor: '#666',
        backgroundColor: 'transparent'
      }]
    },
    options: getChartOptions('Pulse Rate (bpm)', selectedDays)
  });
}

function getChartOptions(yLabel, selectedDays) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    onClick: (event, elements) => {
      if (elements.length > 0 && selectedDays) {
        const index = elements[0].index;
        const day = selectedDays[index];
        if (day && day.date) {
          showDayDetail(day.date);
        }
      }
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
  // Get filtered days
  const filteredDays = getFilteredDailyStats(dailyStats);
  historyTableBody.innerHTML = filteredDays.map(day => {
    const ahiClass = getAHIClass(day.ahi);

    return `
      <tr class="clickable" onclick="showDayDetail('${day.date}')">
        <td>${formatDate(day.date)}</td>
        <td><span class="ahi-badge ${ahiClass}">${day.ahi.toFixed(1)}</span></td>
        <td>${day.usageHours.toFixed(1)} hrs</td>
        <td>${day.maskPress95.toFixed(1)} cmH2O</td>
        <td>${day.leak95.toFixed(0)} L/min</td>
        <td>${day.respRate50.toFixed(0)} /min</td>
        <td>${day.minVent95.toFixed(1)} L/min</td>
        <td>${day.tidVol95.toFixed(0)} mL</td>
        <td>${day.spo2Avg > 0 ? day.spo2Avg.toFixed(1) + '%' : '-'}</td>
        <td>${day.pulseAvg > 0 ? day.pulseAvg.toFixed(0) + ' bpm' : '-'}</td>
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
  // Parse date string manually to avoid timezone issues
  // dateStr format is "YYYY-MM-DD"
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Show detailed data for a specific day
 */
function showDayDetail(dateStr) {
  if (!currentData || !currentData.dailyStats) return;

  const day = currentData.dailyStats.find(d => d.date === dateStr);
  if (!day) return;

  // Parse date for display
  const [year, month, dayNum] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, dayNum);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  dayModalTitle.textContent = formattedDate;
  dayModal.classList.add('active');

  const ahiClass = getAHIClass(day.ahi);

  dayModalBody.innerHTML = `
    <div class="day-detail-section">
      <h4>Sleep Summary</h4>
      <div class="day-detail-grid">
        <div class="day-detail-item">
          <label>Usage Time</label>
          <div class="value">${day.usageHours.toFixed(1)}<span class="unit">hours</span></div>
        </div>
        <div class="day-detail-item">
          <label>AHI</label>
          <div class="value"><span class="ahi-badge ${ahiClass}">${day.ahi.toFixed(2)}</span></div>
        </div>
        <div class="day-detail-item">
          <label>Total Events</label>
          <div class="value">${((day.ahi || 0) * (day.usageHours || 0)).toFixed(0)}<span class="unit">events</span></div>
        </div>
      </div>
    </div>

    <div class="day-detail-section">
      <h4>Respiratory Events (per hour)</h4>
      <div class="day-detail-grid">
        <div class="day-detail-item">
          <label>Obstructive Apneas</label>
          <div class="value">${day.oai.toFixed(2)}</div>
        </div>
        <div class="day-detail-item">
          <label>Central Apneas</label>
          <div class="value">${day.cai.toFixed(2)}</div>
        </div>
        <div class="day-detail-item">
          <label>Hypopneas</label>
          <div class="value">${day.hi.toFixed(2)}</div>
        </div>
        <div class="day-detail-item">
          <label>Unclassified Apneas</label>
          <div class="value">${day.uai.toFixed(2)}</div>
        </div>
        <div class="day-detail-item">
          <label>Apnea Index</label>
          <div class="value">${day.ai.toFixed(2)}</div>
        </div>
        <div class="day-detail-item">
          <label>CSR</label>
          <div class="value">${day.csr.toFixed(2)}<span class="unit">%</span></div>
        </div>
      </div>
    </div>

    <div class="day-detail-section">
      <h4>Pressure (cmH2O)</h4>
      <div class="day-detail-grid">
        <div class="day-detail-item">
          <label>Pressure (50%)</label>
          <div class="value">${day.maskPress50.toFixed(1)}</div>
        </div>
        <div class="day-detail-item">
          <label>Pressure (95%)</label>
          <div class="value">${day.maskPress95.toFixed(1)}</div>
        </div>
        <div class="day-detail-item">
          <label>Max Pressure</label>
          <div class="value">${day.maxPressure.toFixed(1)}</div>
        </div>
        <div class="day-detail-item">
          <label>EPR Level</label>
          <div class="value">${day.eprLevel}</div>
        </div>
      </div>
    </div>

    <div class="day-detail-section">
      <h4>Leak Rate (L/min)</h4>
      <div class="day-detail-grid">
        <div class="day-detail-item">
          <label>Leak (50%)</label>
          <div class="value">${day.leak50.toFixed(1)}</div>
        </div>
        <div class="day-detail-item">
          <label>Leak (95%)</label>
          <div class="value">${day.leak95.toFixed(1)}</div>
        </div>
        <div class="day-detail-item">
          <label>Leak Max</label>
          <div class="value">${day.leakMax.toFixed(1)}</div>
        </div>
      </div>
    </div>

    <div class="day-detail-section">
      <h4>Respiratory Metrics</h4>
      <div class="day-detail-grid">
        <div class="day-detail-item">
          <label>Resp Rate (50%)</label>
          <div class="value">${day.respRate50.toFixed(1)}<span class="unit">/min</span></div>
        </div>
        <div class="day-detail-item">
          <label>Resp Rate (95%)</label>
          <div class="value">${day.respRate95.toFixed(1)}<span class="unit">/min</span></div>
        </div>
        <div class="day-detail-item">
          <label>Tidal Volume (50%)</label>
          <div class="value">${day.tidVol50.toFixed(0)}<span class="unit">mL</span></div>
        </div>
        <div class="day-detail-item">
          <label>Tidal Volume (95%)</label>
          <div class="value">${day.tidVol95.toFixed(0)}<span class="unit">mL</span></div>
        </div>
        <div class="day-detail-item">
          <label>Minute Vent (50%)</label>
          <div class="value">${day.minVent50.toFixed(1)}<span class="unit">L/min</span></div>
        </div>
        <div class="day-detail-item">
          <label>Minute Vent (95%)</label>
          <div class="value">${day.minVent95.toFixed(1)}<span class="unit">L/min</span></div>
        </div>
      </div>
    </div>

    ${day.spo2Avg > 0 || day.pulseAvg > 0 ? `
    <div class="day-detail-section">
      <h4>Oximetry</h4>
      <div class="day-detail-grid">
        ${day.spo2Avg > 0 ? `
        <div class="day-detail-item">
          <label>SpO2 Average</label>
          <div class="value">${day.spo2Avg.toFixed(1)}<span class="unit">%</span></div>
        </div>
        <div class="day-detail-item">
          <label>SpO2 Min</label>
          <div class="value">${day.spo2Min.toFixed(1)}<span class="unit">%</span></div>
        </div>
        <div class="day-detail-item">
          <label>SpO2 Max</label>
          <div class="value">${day.spo2Max.toFixed(1)}<span class="unit">%</span></div>
        </div>
        ` : ''}
        ${day.pulseAvg > 0 ? `
        <div class="day-detail-item">
          <label>Pulse Average</label>
          <div class="value">${day.pulseAvg.toFixed(0)}<span class="unit">bpm</span></div>
        </div>
        <div class="day-detail-item">
          <label>Pulse Min</label>
          <div class="value">${day.pulseMin.toFixed(0)}<span class="unit">bpm</span></div>
        </div>
        <div class="day-detail-item">
          <label>Pulse Max</label>
          <div class="value">${day.pulseMax.toFixed(0)}<span class="unit">bpm</span></div>
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}
  `;
}

// Expose viewSession to global scope for onclick handlers
window.viewSession = viewSession;
window.showDayDetail = showDayDetail;
