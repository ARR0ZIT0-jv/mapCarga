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

// ── Inicialización ──────────────────────────────────────────────
async function init() {
  console.log('[App] Iniciando GranChaco Routes...');

  // Inicializar mapa (empieza oculto, pero se inicializa igual)
  MapManager.init('map');

  // Configurar navegación por pestañas
  initTabs();

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
