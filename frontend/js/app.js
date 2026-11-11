/**
 * app.js — Lógica principal de la aplicación
 * Proyecto: Rutas de Transporte - Gran Chaco y Yacuiba
 */

// ── Estado global ───────────────────────────────────────────────
const AppState = {
  cities: [],
  routes: [],
  queryCount: 0,
  recentRoutes: [],
  lastResult: null
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
    });
  });
}

// ── Cargar ciudades y rutas desde la API ────────────────────────
async function loadData() {
  try {
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

    console.log(`[App] Datos cargados: ${cities.length} ciudades, ${routes.length} rutas.`);

  } catch (error) {
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
    displayRouteResult(result);

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
function displayRouteResult(result) {
  setText('res-distance', `${result.total_distance.toFixed(1)} km`);
  setText('res-time',     `${result.execution_time_ms.toFixed(4)} ms`);
  setText('res-hops',     `${result.path ? result.path.length - 1 : '—'} tramos`);
  setText('res-path',     result.path_names.join(' → '));

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

    activeLineLayer = L.layerGroup().addTo(map);

    // Dibujar recorrido en línea directa continua sin cortes
    const lineColor = line.base_color === '#ffffff' ? '#16a34a' : line.base_color;
    
    // Contorno exterior blanco para alto contraste y visibilidad perfecta
    L.polyline(line.coords, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(activeLineLayer);

    const poly = L.polyline(line.coords, {
      color: lineColor,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(activeLineLayer);

    // Marcar únicamente las paradas clave de la línea (no cada vértice del GPS)
    if (line.waypoints && transitData.landmarks) {
      line.waypoints.forEach((wpId, idx) => {
        const pt = transitData.landmarks[wpId];
        if (!pt) return;
        const isStart = idx === 0;
        const isEnd = idx === line.waypoints.length - 1;
        const label = wpId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        L.circleMarker(pt, {
          radius: isStart || isEnd ? 7 : 5,
          fillColor: isStart ? '#10b981' : (isEnd ? '#ef4444' : '#ffffff'),
          color: lineColor,
          weight: 3,
          fillOpacity: 1
        }).addTo(activeLineLayer)
          .bindPopup(`<strong>${label}</strong><br><small style="color:#64748b;">${isStart ? '🟢 Inicio' : (isEnd ? '🏁 Final' : '📍 Parada')} · ${line.name}</small>`);
      });
    }

    poly.bindPopup(`
      <div style="font-family:sans-serif;">
        <strong style="font-size:1.05rem;">${line.name}</strong><br>
        <span style="color:#64748b; font-size:0.85rem;">${line.operator}</span><br>
        <div style="margin: 6px 0; font-size:0.88rem;">${line.description}</div>
        <small style="color:#2563eb; font-weight:600;">Longitud aproximada: ${line.distance_km} km</small>
      </div>
    `).openPopup();

    // Zoom a la línea
    map.fitBounds(poly.getBounds(), { padding: [35, 35] });
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

  // Cargar datos desde la API (ciudades + rutas + stats)
  await loadData();
  await loadStats();

  console.log('[App] Listo.');
}

// ── Punto de entrada ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
