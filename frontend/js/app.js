/**
 * app.js — Lógica principal de la aplicación
 * TEL420 – Sistemas Paralelos
 * Proyecto: Optimizador de Rutas de Transporte - Gran Chaco
 */

// ── Estado global ───────────────────────────────────────────────
const AppState = {
  cities: [],
  routes: [],
  queryCount: 0,
  recentRoutes: [],
  lastResult: null,
  benchmarkData: null,
  currentDataset: 'large'
};

// ── Utilidades DOM ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showElement(id)   { const el = $(id); if (el) el.classList.remove('hidden'); }
function hideElement(id)   { const el = $(id); if (el) el.classList.add('hidden');    }
function setText(id, txt)  { const el = $(id); if (el) el.textContent = txt;          }
function setHTML(id, html) { const el = $(id); if (el) el.innerHTML   = html;         }

// ── Navegación por pestañas ─────────────────────────────────────
function initTabs() {
  const tabBtns    = document.querySelectorAll('.tab-btn');
  const tabSections = document.querySelectorAll('.tab-section');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      // Actualizar botones
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Mostrar sección correcta
      tabSections.forEach(s => s.classList.remove('active'));
      const section = $(`tab-${target}`);
      if (section) section.classList.add('active');

      // El mapa necesita recalcular tamaño al mostrarse
      if (target === 'map') {
        setTimeout(() => MapManager.invalidateSize(), 150);
      }
      if (target === 'yacuiba') {
        setTimeout(() => YacuibaTransitManager.onShow(), 150);
      }
      if (target === 'benchmark') {
        setTimeout(() => BenchmarkManager.render(AppState.currentDataset || 'large'), 150);
      }
    });
  });
}

// ── Cargar ciudades y rutas desde la API ────────────────────────
async function loadData() {
  try {
    updateServerStatus('connecting');

    const [cities, routes, roadGeometries] = await Promise.all([
      API.getCities(),
      API.getRoutes(),
      fetch('./data_roads.json').then(res => res.ok ? res.json() : {}).catch(() => ({}))
    ]);

    AppState.cities = cities;
    AppState.routes = routes;

    MapManager.setRoadGeometries(roadGeometries);
    populateCitySelects(cities);
    MapManager.drawCities(cities);
    MapManager.drawConnections(cities, routes);
    renderDashboardCities(cities);

    setText('stat-cities', cities.length);
    setText('stat-routes', routes.length);

    // Habilitar botón calcular
    const btn = $('btn-calculate');
    if (btn) btn.disabled = false;

    updateServerStatus('online');
    console.log(`[App] Datos cargados: ${cities.length} ciudades, ${routes.length} rutas.`);

  } catch (error) {
    updateServerStatus('offline');
    console.error('[App] loadData error:', error);
    // Mostrar mensaje de error en el panel del mapa
    setHTML('error-msg', `No se pudo conectar al servidor C++. Verifica que esté ejecutándose en el puerto 8080.<br><small>${error.message}</small>`);
    showElement('error-panel');
  }
}

// ── Cargar estadísticas ─────────────────────────────────────────
async function loadStats() {
  try {
    const stats = await API.getStats();
    if (stats.total_queries !== undefined) {
      AppState.queryCount = stats.total_queries;
      setText('stat-queries', AppState.queryCount);
    }
  } catch (error) {
    // No crítico — el contador local sigue funcionando
    console.warn('[App] loadStats:', error.message);
  }
}

// ── Estado del servidor (indicador en la navbar) ────────────────
function updateServerStatus(state) {
  const dot  = $('status-dot');
  const text = $('status-text');
  if (!dot || !text) return;

  dot.className = `status-dot ${state}`;
  const labels = {
    connecting: 'Conectando...',
    online:     'Servidor activo',
    offline:    'Servidor desconectado'
  };
  text.textContent = labels[state] || state;
}

// ── Poblar selectores de origen/destino ─────────────────────────
function populateCitySelects(cities) {
  const originSel = $('select-origin');
  const destSel   = $('select-destination');
  if (!originSel || !destSel) return;

  let optHtml = '<option value="">— Seleccionar ciudad —</option>';
  cities.forEach(c => {
    optHtml += `<option value="${c.id}">${c.name} (${c.country})</option>`;
  });

  originSel.innerHTML = optHtml;
  destSel.innerHTML   = optHtml;
}

// ── Renderizar lista de ciudades en el dashboard ────────────────
function renderDashboardCities(cities) {
  const container = $('cities-list');
  if (!container) return;

  const countryClass = {
    'Bolivia':   'bolivia',
    'Argentina': 'argentina',
    'Paraguay':  'paraguay'
  };

  let html = '';
  cities.forEach(c => {
    const cls = countryClass[c.country] || '';
    html += `<span class="city-badge ${cls}" title="${c.country}: lat ${c.lat.toFixed(4)}, lon ${c.lon.toFixed(4)}">${c.name}</span>`;
  });
  container.innerHTML = html;
}

// ── Calcular ruta ───────────────────────────────────────────────
async function calculateRoute() {
  const originId = $('select-origin')?.value;
  const destId   = $('select-destination')?.value;
  const mode     = $('select-mode')?.value || 'sequential';

  // Validación
  if (!originId || !destId) {
    showRouteError('Selecciona una ciudad de origen y una de destino.');
    return;
  }
  if (originId === destId) {
    showRouteError('El origen y el destino no pueden ser la misma ciudad.');
    return;
  }

  // Estado de carga
  hideElement('result-panel');
  hideElement('error-panel');
  showElement('loading-panel');

  const btn = $('btn-calculate');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando...'; }

  try {
    const result = await API.findShortestRoute(parseInt(originId), parseInt(destId));
    AppState.lastResult = result;

    if (!result.found) {
      showRouteError('No se encontró ninguna ruta entre las ciudades seleccionadas.');
      return;
    }

    // Mostrar resultado en el panel lateral
    displayRouteResult(result, mode);

    // Dibujar en el mapa
    MapManager.drawRoute(result);

    // Actualizar tabla de comparación
    renderComparisonTable(result);

    // Historial de rutas recientes
    addToRecentRoutes(result);

    // Actualizar contador de consultas
    AppState.queryCount++;
    setText('stat-queries', AppState.queryCount);

  } catch (error) {
    showRouteError(`Error al calcular ruta: ${error.message}`);
  } finally {
    hideElement('loading-panel');
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Calcular ruta'; }
  }
}

// ── Mostrar resultado en el panel lateral ───────────────────────
function displayRouteResult(result, mode = 'sequential') {
  setText('res-distance', `${result.total_distance.toFixed(1)} km`);
  setText('res-time',     `${result.execution_time_ms.toFixed(4)} ms`);
  setText('res-hops',     `${result.path ? result.path.length - 1 : '—'} tramos`);
  setText('res-path',     result.path_names.join(' → '));

  const modeBadge = mode === 'openmp' ? '⚡ OpenMP (Multihilo)' : '🌱 Secuencial (1 núcleo)';
  setText('res-mode', modeBadge);

  hideElement('error-panel');
  showElement('result-panel');
}

// ── Renderizar tabla de comparación ────────────────────────────
function renderComparisonTable(result) {
  const tbody   = $('routes-tbody');
  const empty   = $('compare-empty');
  const content = $('compare-content');
  const header  = $('compare-header');

  if (!tbody) return;

  // Encabezado de la comparación
  if (header) {
    const origin = result.path_names[0];
    const dest   = result.path_names[result.path_names.length - 1];
    header.innerHTML = `
      <strong>🔍 Consulta:</strong> ${origin} → ${dest}
      <span style="margin-left:12px;color:#94a3b8;font-size:0.9em;">
        (${result.execution_time_ms.toFixed(4)} ms — Dijkstra secuencial)
      </span>`;
  }

  // Fila ruta óptima
  let html = `
    <tr>
      <td>1</td>
      <td><span style="color:#3b82f6;font-weight:700;">🔵 Óptima</span></td>
      <td>${result.path_names.join(' → ')}</td>
      <td>${result.path ? result.path.length : '—'}</td>
      <td><strong>${result.total_distance.toFixed(1)} km</strong></td>
      <td>—</td>
    </tr>
  `;

  // Filas alternativas
  if (result.alternatives && result.alternatives.length > 0) {
    result.alternatives.forEach((alt, idx) => {
      const diff = alt.total_distance - result.total_distance;
      html += `
        <tr>
          <td>${idx + 2}</td>
          <td><span style="color:#f97316;">🟠 Alt. ${idx + 1}</span></td>
          <td>${alt.path_names.join(' → ')}</td>
          <td>${alt.path_names.length}</td>
          <td>${alt.total_distance.toFixed(1)} km</td>
          <td style="color:#f97316;">+${diff.toFixed(1)} km</td>
        </tr>
      `;
    });
  } else {
    html += `<tr><td colspan="6" style="text-align:center;color:#64748b;">Sin rutas alternativas disponibles</td></tr>`;
  }

  tbody.innerHTML = html;

  // Mostrar contenido y ocultar estado vacío
  if (empty)   empty.classList.add('hidden');
  if (content) content.classList.remove('hidden');
}

// ── Historial de rutas recientes ────────────────────────────────
function addToRecentRoutes(result) {
  AppState.recentRoutes.unshift(result);
  if (AppState.recentRoutes.length > 5) AppState.recentRoutes.pop();

  const container = $('recent-routes');
  if (!container) return;

  let html = '';
  AppState.recentRoutes.forEach(r => {
    const origin = r.path_names[0];
    const dest   = r.path_names[r.path_names.length - 1];
    html += `
      <div style="
        display:flex; justify-content:space-between; align-items:center;
        padding:8px 12px; margin-bottom:6px;
        background:var(--surface-2,#1e293b);
        border-left:3px solid #3b82f6;
        border-radius:0 6px 6px 0;
        font-size:0.88em;
      ">
        <span>${origin} → ${dest}</span>
        <span style="color:#94a3b8;white-space:nowrap;margin-left:8px;">
          ${r.total_distance.toFixed(1)} km
        </span>
      </div>
    `;
  });

  container.innerHTML = html || '<p class="empty-msg">Aún no se han calculado rutas.</p>';
}

// ── Limpiar rutas del mapa ──────────────────────────────────────
function clearMap() {
  MapManager.clearRoutes();
  hideElement('result-panel');
  hideElement('error-panel');
}

// ── Mostrar error en panel lateral ─────────────────────────────
function showRouteError(msg) {
  setHTML('error-msg', msg);
  hideElement('result-panel');
  showElement('error-panel');
}

// ── Módulo de Benchmarking (Chart.js) ───────────────────────────
const BenchmarkManager = (() => {
  let chartTimes = null;
  let chartSpeedup = null;
  let chartEfficiency = null;

  function init() {
    const buttons = document.querySelectorAll('.btn-dataset');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const ds = btn.dataset.dataset;
        AppState.currentDataset = ds;
        render(ds);
      });
    });
  }

  function render(datasetKey = 'large') {
    if (!AppState.benchmarkData || !AppState.benchmarkData.summary) return;

    const data = AppState.benchmarkData.summary.filter(d => d.dataset === datasetKey);
    if (!data || data.length === 0) return;

    const labelsMap = {
      large: 'Large (10.000 consultas)',
      medium: 'Medium (1.000 consultas)',
      small: 'Small (100 consultas)'
    };
    setText('bench-table-title', `📋 Métricas Detalladas — Carga ${labelsMap[datasetKey] || datasetKey}`);

    // KPIs
    const seqRow = data.find(d => d.version === 'sequential') || { avg_time_ms: 0 };
    const bestPar = data.filter(d => d.version !== 'sequential')
                        .reduce((min, d) => d.avg_time_ms < min.avg_time_ms ? d : min, { avg_time_ms: Infinity, version: '', workers: 1 });
    const maxSp = data.reduce((max, d) => d.speedup > max.speedup ? d : max, { speedup: 0 });
    const bestEff = data.filter(d => d.version !== 'sequential' && d.workers > 1)
                        .reduce((max, d) => d.efficiency > max.efficiency ? d : max, { efficiency: 0 });

    setText('kpi-seq', `${seqRow.avg_time_ms.toFixed(2)} ms`);
    setText('kpi-par', `${bestPar.avg_time_ms.toFixed(2)} ms`);
    setText('kpi-par-sub', `${bestPar.version.toUpperCase()} (${bestPar.workers} ${bestPar.version === 'mpi' ? 'nodos' : 'hilos'})`);
    setText('kpi-speedup', `${maxSp.speedup.toFixed(2)}x`);
    setText('kpi-efficiency', `${(bestEff.efficiency * 100).toFixed(0)}%`);

    // Renderizar Gráficas
    renderTimesChart(data);
    renderSpeedupChart(data);
    renderEfficiencyChart(data);

    // Renderizar Tabla
    renderTable(data);
  }

  function renderTimesChart(data) {
    const ctx = $('chart-times')?.getContext('2d');
    if (!ctx) return;

    if (chartTimes) chartTimes.destroy();

    const sorted = [...data].sort((a, b) => {
      if (a.version === 'sequential') return -1;
      if (b.version === 'sequential') return 1;
      if (a.version !== b.version) return a.version.localeCompare(b.version);
      return a.workers - b.workers;
    });

    const labels = sorted.map(d => {
      if (d.version === 'sequential') return 'Secuencial';
      if (d.version === 'openmp') return `OpenMP (${d.workers}T)`;
      return `MPI (${d.workers}N)`;
    });
    const values = sorted.map(d => d.avg_time_ms);
    const colors = sorted.map(d => {
      if (d.version === 'sequential') return '#3b82f6';
      if (d.version === 'openmp') return '#8b5cf6';
      return '#10b981';
    });

    chartTimes = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tiempo promedio (ms)',
          data: values,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.raw} ms`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Milisegundos (ms)' }
          }
        }
      }
    });
  }

  function renderSpeedupChart(data) {
    const ctx = $('chart-speedup')?.getContext('2d');
    if (!ctx) return;

    if (chartSpeedup) chartSpeedup.destroy();

    const ompData = data.filter(d => d.version === 'openmp').sort((a,b) => a.workers - b.workers);
    const mpiData = data.filter(d => d.version === 'mpi').sort((a,b) => a.workers - b.workers);

    const labels = [1, 2, 3, 4, 8, 16];
    const ideal = labels.map(p => p);

    const ompPoints = labels.map(p => {
      const match = ompData.find(d => d.workers === p);
      return match ? match.speedup : null;
    });

    const mpiPoints = labels.map(p => {
      const match = mpiData.find(d => d.workers === p);
      return match ? match.speedup : null;
    });

    chartSpeedup = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(p => `${p}`),
        datasets: [
          {
            label: 'OpenMP',
            data: ompPoints,
            borderColor: '#8b5cf6',
            backgroundColor: '#8b5cf6',
            tension: 0.2,
            spanGaps: true
          },
          {
            label: 'OpenMPI',
            data: mpiPoints,
            borderColor: '#10b981',
            backgroundColor: '#10b981',
            tension: 0.2,
            spanGaps: true
          },
          {
            label: 'Ideal S(p)=p',
            data: ideal,
            borderColor: '#94a3b8',
            borderDash: [5, 5],
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          x: { title: { display: true, text: 'Hilos / Nodos (p)' } },
          y: { beginAtZero: true, title: { display: true, text: 'Speedup S(p)' } }
        }
      }
    });
  }

  function renderEfficiencyChart(data) {
    const ctx = $('chart-efficiency')?.getContext('2d');
    if (!ctx) return;

    if (chartEfficiency) chartEfficiency.destroy();

    const ompData = data.filter(d => d.version === 'openmp').sort((a,b) => a.workers - b.workers);
    const mpiData = data.filter(d => d.version === 'mpi').sort((a,b) => a.workers - b.workers);

    const labels = [1, 2, 3, 4, 8, 16];
    const ideal = labels.map(() => 1.0);

    const ompPoints = labels.map(p => {
      const match = ompData.find(d => d.workers === p);
      return match ? match.efficiency : null;
    });

    const mpiPoints = labels.map(p => {
      const match = mpiData.find(d => d.workers === p);
      return match ? match.efficiency : null;
    });

    chartEfficiency = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(p => `${p}`),
        datasets: [
          {
            label: 'OpenMP',
            data: ompPoints,
            borderColor: '#8b5cf6',
            backgroundColor: '#8b5cf6',
            tension: 0.2,
            spanGaps: true
          },
          {
            label: 'OpenMPI',
            data: mpiPoints,
            borderColor: '#10b981',
            backgroundColor: '#10b981',
            tension: 0.2,
            spanGaps: true
          },
          {
            label: 'Ideal E=1.0 (100%)',
            data: ideal,
            borderColor: '#94a3b8',
            borderDash: [5, 5],
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          x: { title: { display: true, text: 'Hilos / Nodos (p)' } },
          y: { beginAtZero: true, max: 1.2, title: { display: true, text: 'Eficiencia E(p)' } }
        }
      }
    });
  }

  function renderTable(data) {
    const tbody = $('bench-tbody');
    if (!tbody) return;

    let html = '';
    const sorted = [...data].sort((a, b) => {
      if (a.version === 'sequential') return -1;
      if (b.version === 'sequential') return 1;
      if (a.version !== b.version) return a.version.localeCompare(b.version);
      return a.workers - b.workers;
    });

    sorted.forEach(row => {
      const versionBadge = {
        sequential: '<span style="color:#2563eb; font-weight:700;">🌱 Secuencial</span>',
        openmp:     '<span style="color:#7c3aed; font-weight:700;">⚡ OpenMP</span>',
        mpi:        '<span style="color:#059669; font-weight:700;">🌐 OpenMPI</span>'
      }[row.version] || row.version;

      const workerText = row.version === 'sequential' ? '1 núcleo' : `${row.workers} ${row.version === 'mpi' ? 'nodos' : 'hilos'}`;
      const speedupText = row.speedup >= 1.5 ? `<strong style="color:#059669;">${row.speedup.toFixed(2)}x</strong>` : `${row.speedup.toFixed(2)}x`;
      const effText = `${(row.efficiency * 100).toFixed(0)}%`;

      html += `
        <tr>
          <td>${versionBadge}</td>
          <td>${workerText}</td>
          <td>${row.queries.toLocaleString()}</td>
          <td><strong>${row.avg_time_ms.toFixed(2)} ms</strong></td>
          <td>${speedupText}</td>
          <td>${effText}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  return { init, render };
})();

// ── Módulo de Transporte Urbano y Periurbano de Yacuiba ─────────
const YacuibaTransitManager = (() => {
  let map = null;
  let transitData = null;
  let activeLineLayer = null;
  let landmarkMarkers = [];
  let currentFilter = 'all';

  async function init() {
    try {
      const res = await fetch('./data_yacuiba_transit.json');
      if (!res.ok) return;
      transitData = await res.json();
      setupFilters();
      renderList('all');
    } catch (err) {
      console.warn('[TransitManager] Error al cargar datos:', err.message);
    }
  }

  function initMap() {
    if (map) return;
    const container = document.getElementById('map-yacuiba');
    if (!container) return;

    map = L.map('map-yacuiba', {
      center: [-21.9667, -63.6833],
      zoom: 13,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);

    // Dibujar paradas clave
    if (transitData && transitData.landmarks) {
      const lm = transitData.landmarks;
      const keyPoints = [
        { name: 'Plaza 12 de Agosto (Centro)', coords: lm.plaza_12_agosto, icon: '🏛️' },
        { name: 'Mercado Campesino', coords: lm.mercado_campesino, icon: '🛒' },
        { name: 'Hospital Rubén Zelaya', coords: lm.hospital_zelaya, icon: '🏥' },
        { name: 'Terminal de Buses', coords: lm.terminal_buses, icon: '🚌' },
        { name: 'San José de Pocitos (Frontera)', coords: lm.pocitos, icon: '🛂' },
        { name: 'Campo Pajoso (Cruce Norte)', coords: lm.campo_pajoso, icon: '🛣️' }
      ];

      keyPoints.forEach(p => {
        const marker = L.marker(p.coords, {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              background: #ffffff;
              border: 2px solid #1e293b;
              border-radius: 50%;
              width: 28px; height: 28px;
              display: flex; align-items: center; justify-content: center;
              font-size: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">${p.icon}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          })
        }).addTo(map).bindPopup(`<strong>${p.name}</strong>`);
        landmarkMarkers.push(marker);
      });
    }

    // Seleccionar la primera línea por defecto
    if (transitData && transitData.lines && transitData.lines.length > 0) {
      selectLine(transitData.lines[0].id);
    }
  }

  function onShow() {
    if (!map) {
      initMap();
    } else {
      map.invalidateSize();
    }
  }

  function setupFilters() {
    const filterBtns = document.querySelectorAll('.btn-transit-filter');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderList(currentFilter);
      });
    });
  }

  function renderList(filter) {
    const listContainer = document.getElementById('transit-list');
    if (!listContainer || !transitData) return;

    let lines = transitData.lines;
    if (filter !== 'all') {
      lines = lines.filter(l => l.category === filter);
    }

    let html = '';
    lines.forEach(line => {
      let flagHTML = '';
      if (line.category === 'micro') {
        flagHTML = `
          <div class="flag-visual" style="background: ${line.base_color};">
            <div class="flag-bus-icon">🚌</div>
          </div>
        `;
      } else if (line.stripes_count === 1) {
        flagHTML = `
          <div class="flag-visual" style="background: ${line.base_color};">
            <div class="flag-stripe-1" style="background: ${line.stripe_color};"></div>
          </div>
        `;
      } else if (line.stripes_count === 2) {
        flagHTML = `
          <div class="flag-visual" style="background: ${line.base_color};">
            <div class="flag-stripe-2a" style="background: ${line.stripe_color};"></div>
            <div class="flag-stripe-2b" style="background: ${line.stripe_color};"></div>
          </div>
        `;
      }

      const catLabel = {
        'micro': 'Micro Urbano',
        'trufi_1f': 'Trufi (1 Franja)',
        'trufi_2f': 'Trufi (2 Franjas)'
      }[line.category] || 'Transporte';

      html += `
        <div class="transit-card" data-id="${line.id}" id="tcard-${line.id}">
          <div class="transit-header">
            <div style="display:flex; align-items:center; gap:8px;">
              ${flagHTML}
              <div>
                <div class="transit-title">${line.name}</div>
                <div class="transit-operator">${line.operator}</div>
              </div>
            </div>
            <span class="badge-category ${line.category}">${catLabel}</span>
          </div>
          <div class="transit-desc">${line.description}</div>
          <div class="transit-meta">
            <span style="color:#64748b;">Distintivo: <strong>${line.flag_desc}</strong></span>
            <span style="font-weight:700; color:var(--primary);">${line.distance_km} km</span>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;

    // Asignar clics a tarjetas
    const cards = listContainer.querySelectorAll('.transit-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        selectLine(card.dataset.id);
      });
    });
  }

  function selectLine(lineId) {
    if (!transitData || !map) return;
    const line = transitData.lines.find(l => l.id === lineId);
    if (!line) return;

    // Marcar tarjeta activa
    document.querySelectorAll('.transit-card').forEach(c => c.classList.remove('active'));
    const targetCard = document.getElementById(`tcard-${lineId}`);
    if (targetCard) targetCard.classList.add('active');

    // Limpiar capa anterior
    if (activeLineLayer) {
      map.removeLayer(activeLineLayer);
    }

    // Dibujar recorrido en el mapa de Yacuiba
    activeLineLayer = L.polyline(line.coords, {
      color: line.base_color === '#ffffff' ? '#16a34a' : line.base_color,
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    activeLineLayer.bindPopup(`
      <div style="font-family:sans-serif;">
        <strong style="font-size:1.05rem;">${line.name}</strong><br>
        <span style="color:#64748b; font-size:0.85rem;">${line.operator}</span><br>
        <div style="margin: 6px 0; font-size:0.88rem;">${line.description}</div>
        <small style="color:#2563eb; font-weight:600;">Longitud del tramo: ${line.distance_km} km</small>
      </div>
    `).openPopup();

    // Zoom a la línea
    map.fitBounds(activeLineLayer.getBounds(), { padding: [30, 30] });
  }

  return { init, onShow, selectLine };
})();

// ── Inicialización ──────────────────────────────────────────────
async function init() {
  console.log('[App] Iniciando GranChaco Routes...');

  // Inicializar mapa (empieza oculto, pero se inicializa igual)
  MapManager.init('map');

  // Configurar navegación por pestañas
  initTabs();

  // Inicializar Benchmark
  BenchmarkManager.init();

  // Inicializar Transporte Yacuiba
  await YacuibaTransitManager.init();

  // Eventos de botones
  const btnCalc  = $('btn-calculate');
  const btnClear = $('btn-clear');
  if (btnCalc)  btnCalc.addEventListener('click', calculateRoute);
  if (btnClear) btnClear.addEventListener('click', clearMap);

  // Inicializar tabla de comparación en estado vacío
  const tbody = $('routes-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;">
      Calcula una ruta en la pestaña <strong>Mapa y Rutas</strong> para ver la comparación aquí.
    </td></tr>`;
  }

  // Cargar datos desde la API (ciudades + rutas + stats + benchmark)
  await loadData();
  await loadStats();

  try {
    AppState.benchmarkData = await API.getBenchmarkData();
    BenchmarkManager.render('large');
  } catch (err) {
    console.warn('[App] Error cargando benchmark:', err.message);
  }

  console.log('[App] Listo.');
}

// ── Punto de entrada ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
