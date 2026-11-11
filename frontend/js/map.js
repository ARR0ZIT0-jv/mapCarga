/**
 * map.js — Módulo de gestión del mapa interactivo con Leaflet
 * Proyecto: Rutas de Transporte - Gran Chaco y Yacuiba
 */

const MapManager = (() => {
  // ── Estado interno ──────────────────────────────────────────────
  let map = null;
  let cityMarkers = [];
  let connectionLines = [];
  let routeLayers = [];       // Capas de la ruta calculada (se limpian con clearRoutes)
  let citiesData = [];
  let routesData = [];
  let roadGeometries = {};    // Curvas reales de carreteras { "u-v": [[lat, lon], ...] }

  // ── Configuración visual ────────────────────────────────────────
  const YACUIBA_COORDS = [-21.9667, -63.6833];
  const INITIAL_ZOOM = 6;

  const COLORS = {
    connection: '#64748b',
    routeMain:  '#2563eb',
    routeAlt:   '#ea580c',
    markerStart: '#16a34a',
    markerEnd:   '#dc2626',
    markerCity:  '#4f46e5',
    markerYacuiba: '#eab308'
  };

  // ── Iconos personalizados ───────────────────────────────────────
  function createCityIcon(isYacuiba = false, type = 'default') {
    let color = COLORS.markerCity;
    let size = 11;
    let border = '2px solid #ffffff';

    if (isYacuiba)        { color = COLORS.markerYacuiba; size = 15; }
    if (type === 'start') { color = COLORS.markerStart;   size = 15; }
    if (type === 'end')   { color = COLORS.markerEnd;     size = 15; }

    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px; height:${size}px;
        background:${color};
        border:${border};
        border-radius:50%;
        box-shadow: 0 1px 5px rgba(0,0,0,0.45);
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  // ── Inicialización del mapa ─────────────────────────────────────
  function init(containerId = 'map') {
    if (map) return;

    map = L.map(containerId, {
      center: YACUIBA_COORDS,
      zoom: INITIAL_ZOOM,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(map);

    console.log('[MapManager] Mapa Leaflet inicializado.');
  }

  // ── Asignar datos de geometría de carreteras precalculadas ───────
  function setRoadGeometries(data) {
    roadGeometries = data || {};
    console.log(`[MapManager] ${Object.keys(roadGeometries).length} geometrías de carreteras cargadas.`);
  }

  // ── Obtener puntos que siguen la carretera entre dos ciudades ───
  function getSegmentPoints(u, v) {
    const key = `${Math.min(u, v)}-${Math.max(u, v)}`;
    const pts = roadGeometries[key];

    if (pts && pts.length > 0) {
      // Orientar los puntos para que vayan de u hacia v
      const cityU = citiesData.find(c => c.id === u);
      const cityV = citiesData.find(c => c.id === v);
      if (cityU && cityV) {
        const dStartToU = Math.hypot(pts[0][0] - cityU.lat, pts[0][1] - cityU.lon);
        const dEndToU   = Math.hypot(pts[pts.length - 1][0] - cityU.lat, pts[pts.length - 1][1] - cityU.lon);
        if (dStartToU > dEndToU) {
          return pts.slice().reverse();
        }
      }
      return pts.slice();
    }

    // Fallback: línea directa si no estuviese en la base de datos
    const from = citiesData.find(c => c.id === u);
    const to   = citiesData.find(c => c.id === v);
    if (from && to) return [[from.lat, from.lon], [to.lat, to.lon]];
    return [];
  }

  // ── Dibujar ciudades ────────────────────────────────────────────
  function drawCities(cities) {
    cityMarkers.forEach(m => map.removeLayer(m));
    cityMarkers = [];
    citiesData = cities;

    cities.forEach(city => {
      const isYacuiba = city.name === 'Yacuiba';
      const icon = createCityIcon(isYacuiba);

      const marker = L.marker([city.lat, city.lon], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:sans-serif; min-width:160px;">
            <strong style="font-size:1.05em;">${city.name}</strong><br>
            <span style="color:#64748b; font-size:0.85em;">${city.country}</span><br>
            <small style="color:#94a3b8;">ID: ${city.id} | ${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}</small>
          </div>
        `);

      if (isYacuiba) {
        marker.bindTooltip('★ Yacuiba (referencia)', {
          permanent: true,
          direction: 'top',
          className: 'yacuiba-label',
          offset: [0, -8]
        });
        marker.openTooltip();
      }

      cityMarkers.push(marker);
    });

    console.log(`[MapManager] ${cities.length} ciudades dibujadas.`);
  }

  // ── Obtener puntos que siguen la carretera real unidos sin cortes ───
  function getConnectedRoadPoints(u, v) {
    const from = citiesData.find(c => c.id === u);
    const to   = citiesData.find(c => c.id === v);
    if (!from || !to) return [];

    const key = `${Math.min(u, v)}-${Math.max(u, v)}`;
    const pts = roadGeometries[key];

    if (pts && pts.length > 0) {
      const dStartToU = Math.hypot(pts[0][0] - from.lat, pts[0][1] - from.lon);
      const dEndToU   = Math.hypot(pts[pts.length - 1][0] - from.lat, pts[pts.length - 1][1] - from.lon);
      const oriented = (dStartToU > dEndToU) ? pts.slice().reverse() : pts.slice();

      // Coser los extremos con las ciudades para que sigan el camino continuo sin ningún corte
      return [[from.lat, from.lon], ...oriented, [to.lat, to.lon]];
    }

    return [[from.lat, from.lon], [to.lat, to.lon]];
  }

  // ── Construir línea continua a partir de una lista de paradas ───
  function buildPathRoadCoords(pathIds, fallbackCoords) {
    if (!pathIds || pathIds.length < 2) return fallbackCoords || [];

    const fullCoords = [];
    for (let i = 0; i < pathIds.length - 1; i++) {
      const seg = getConnectedRoadPoints(pathIds[i], pathIds[i + 1]);
      if (seg && seg.length > 0) {
        if (fullCoords.length > 0) {
          fullCoords.push(...seg.slice(1));
        } else {
          fullCoords.push(...seg);
        }
      }
    }

    return fullCoords.length > 0 ? fullCoords : (fallbackCoords || []);
  }

  // ── Dibujar conexiones (carreteras continuas sin cortes) ────────
  function drawConnections(cities, routes) {
    connectionLines.forEach(l => map.removeLayer(l));
    connectionLines = [];
    routesData = routes;
    citiesData = cities;

    const cityById = {};
    cities.forEach(c => { cityById[c.id] = c; });

    routes.forEach(route => {
      const from = cityById[route.from_id];
      const to   = cityById[route.to_id];
      if (!from || !to) return;

      const roadPoints = getConnectedRoadPoints(route.from_id, route.to_id);

      const line = L.polyline(roadPoints, {
        color: COLORS.connection,
        weight: 2.2,
        opacity: 0.7,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map)
       .bindPopup(`
         <small style="font-family:sans-serif;">
           <strong>${from.name} ↔ ${to.name}</strong><br>
           ${route.distance_km} km (carretera continua)
         </small>
       `);

      connectionLines.push(line);
    });

    console.log(`[MapManager] ${routes.length} conexiones trazadas siguiendo carreteras continuas.`);
  }

  // ── Dibujar ruta calculada (camino continuo sin cortes) ──────────
  function drawRoute(result) {
    clearRoutes();

    if (!result || !result.found) {
      console.warn('[MapManager] No se encontró ruta para dibujar.');
      return;
    }

    const bounds = [];

    // ── 1. Ruta óptima (azul, gruesa, continua siguiendo carretera) ──
    const mainRoadCoords = buildPathRoadCoords(result.path, result.path_coords);

    if (mainRoadCoords.length > 1) {
      const mainLine = L.polyline(mainRoadCoords, {
        color: COLORS.routeMain,
        weight: 6,
        opacity: 0.92,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map)
       .bindPopup(`
         <div style="font-family:sans-serif;">
           <strong style="color:#1d4ed8; font-size:1.05em;">🔵 Ruta óptima</strong><br>
           Distancia: <strong>${result.total_distance.toFixed(1)} km</strong><br>
           Tiempo cálculo: ${result.execution_time_ms.toFixed(3)} ms<br>
           Paradas: ${result.path_names.join(' → ')}<br>
           <span style="color:#059669; font-size:0.85em; font-weight:600;">🛣️ Carretera continua</span>
         </div>
       `);

      routeLayers.push(mainLine);
      mainRoadCoords.forEach(c => bounds.push(c));
    }

    // ── 2. Rutas alternativas (naranja, discontinua, continua) ──
    if (result.alternatives && result.alternatives.length > 0) {
      result.alternatives.forEach((alt, idx) => {
        const altRoadCoords = buildPathRoadCoords(alt.path, alt.path_coords);
        if (altRoadCoords.length < 2) return;

        const altLine = L.polyline(altRoadCoords, {
          color: COLORS.routeAlt,
          weight: 4,
          opacity: 0.8,
          dashArray: '8 8',
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map)
         .bindPopup(`
           <div style="font-family:sans-serif;">
             <strong style="color:#c2410c; font-size:1.05em;">🟠 Alternativa ${idx + 1}</strong><br>
             Distancia: ${alt.total_distance.toFixed(1)} km<br>
             Paradas: ${alt.path_names.join(' → ')}<br>
             <span style="color:#059669; font-size:0.85em; font-weight:600;">🛣️ Carretera continua</span>
           </div>
         `);

        routeLayers.push(altLine);
        altRoadCoords.forEach(c => bounds.push(c));
      });
    }

    // ── 3. Marcadores de Origen (verde) y Destino (rojo) ──
    if (result.path_coords && result.path_coords.length >= 2) {
      const startCoord = result.path_coords[0];
      const endCoord   = result.path_coords[result.path_coords.length - 1];
      const startName  = result.path_names[0];
      const endName    = result.path_names[result.path_names.length - 1];

      const startMarker = L.marker(startCoord, { icon: createCityIcon(false, 'start') })
        .addTo(map)
        .bindPopup(`<strong>🟢 Origen: ${startName}</strong>`);

      const endMarker = L.marker(endCoord, { icon: createCityIcon(false, 'end') })
        .addTo(map)
        .bindPopup(`<strong>🔴 Destino: ${endName}</strong>`);

      routeLayers.push(startMarker, endMarker);
    }

    // ── Ajustar vista a la ruta ──
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }

    console.log('[MapManager] Ruta continua trazada sobre carreteras reales.');
  }

  // ── Limpiar capas de ruta (conservar ciudades y conexiones) ────
  function clearRoutes() {
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];
    console.log('[MapManager] Rutas limpiadas.');
  }

  // ── Forzar redimensionado ───────────────────────────────────────
  function invalidateSize() {
    if (map) map.invalidateSize();
  }

  // ── API pública ─────────────────────────────────────────────────
  return {
    init,
    setRoadGeometries,
    drawCities,
    drawConnections,
    drawRoute,
    clearRoutes,
    invalidateSize
  };
})();
