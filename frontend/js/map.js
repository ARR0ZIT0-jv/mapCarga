/**
 * map.js — Módulo de gestión del mapa interactivo con Leaflet
 * TEL420 – Sistemas Paralelos
 * Proyecto: Optimizador de Rutas de Transporte - Gran Chaco
 */

const MapManager = (() => {
  // ── Estado interno ──────────────────────────────────────────────
  let map = null;
  let osmLayer = null;
  let offlineLayerGroup = null;
  let boundariesData = null;
  let mapMode = 'online';

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

    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    });

    offlineLayerGroup = L.layerGroup();

    // Iniciar con capa online
    osmLayer.addTo(map);

    // Auto-detección: si fallan los tiles de OSM, avisar o alternar
    osmLayer.on('tileerror', () => {
      console.warn('[MapManager] Falla de conexión a OpenStreetMap. Puedes activar el modo Sin Internet.');
    });

    // Configurar botones del selector Online / Offline
    const btnOnline  = document.getElementById('btn-mode-online');
    const btnOffline = document.getElementById('btn-mode-offline');
    if (btnOnline)  btnOnline.addEventListener('click', () => setMapMode('online'));
    if (btnOffline) btnOffline.addEventListener('click', () => setMapMode('offline'));

    console.log('[MapManager] Mapa Leaflet inicializado con soporte Online / Offline.');
  }

  // ── Asignar fronteras para el modo Offline ───────────────────────
  function setBoundaries(data) {
    boundariesData = data;
    if (!offlineLayerGroup) return;

    offlineLayerGroup.clearLayers();

    const countryStyles = {
      'BOL': { fillColor: '#dcfce7', color: '#16a34a', weight: 2, fillOpacity: 0.8 },
      'ARG': { fillColor: '#e0f2fe', color: '#0284c7', weight: 2, fillOpacity: 0.8 },
      'PRY': { fillColor: '#ffedd5', color: '#ea580c', weight: 2, fillOpacity: 0.8 }
    };

    const geoLayer = L.geoJSON(boundariesData, {
      style: feature => countryStyles[feature.id] || { fillColor: '#f1f5f9', color: '#64748b', weight: 1.5, fillOpacity: 0.6 }
    });
    offlineLayerGroup.addLayer(geoLayer);

    // Rótulos geográficos de países para modo offline
    const countryLabels = [
      { name: 'BOLIVIA', coords: [-17.2, -64.8], color: '#15803d' },
      { name: 'ARGENTINA', coords: [-27.2, -64.2], color: '#0369a1' },
      { name: 'PARAGUAY', coords: [-23.4, -58.4], color: '#c2410c' }
    ];

    countryLabels.forEach(l => {
      const labelMarker = L.marker(l.coords, {
        icon: L.divIcon({
          className: 'country-label-offline',
          html: `<div style="font-size:1.15rem; font-weight:800; color:${l.color}; letter-spacing:4px; opacity:0.8; text-shadow:0 1px 4px rgba(255,255,255,0.9); pointer-events:none;">${l.name}</div>`,
          iconSize: [140, 26],
          iconAnchor: [70, 13]
        })
      });
      offlineLayerGroup.addLayer(labelMarker);
    });

    console.log('[MapManager] Capa offline configurada con fronteras vectoriales locales.');
  }

  // ── Cambiar entre Modo Online y Modo Offline ────────────────────
  function setMapMode(mode) {
    mapMode = mode;
    if (mode === 'offline') {
      if (map && map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
      if (map && !map.hasLayer(offlineLayerGroup)) offlineLayerGroup.addTo(map);
    } else {
      if (map && map.hasLayer(offlineLayerGroup)) map.removeLayer(offlineLayerGroup);
      if (map && !map.hasLayer(osmLayer)) osmLayer.addTo(map);
    }

    const btnOnline  = document.getElementById('btn-mode-online');
    const btnOffline = document.getElementById('btn-mode-offline');
    if (btnOnline && btnOffline) {
      if (mode === 'offline') {
        btnOffline.classList.add('active');
        btnOnline.classList.remove('active');
      } else {
        btnOnline.classList.add('active');
        btnOffline.classList.remove('active');
      }
    }

    console.log(`[MapManager] Modo de mapa cambiado a: ${mode}`);
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

  // ── Dibujar conexiones (carreteras de la red siguiendo curvas) ───
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

      // Obtener la trayectoria siguiendo la carretera real
      const roadPoints = getSegmentPoints(route.from_id, route.to_id);

      const line = L.polyline(roadPoints, {
        color: COLORS.connection,
        weight: 2.2,
        opacity: 0.65,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map)
       .bindPopup(`
         <small style="font-family:sans-serif;">
           <strong>${from.name} ↔ ${to.name}</strong><br>
           ${route.distance_km} km (carretera real)
         </small>
       `);

      connectionLines.push(line);
    });

    console.log(`[MapManager] ${routes.length} conexiones trazadas siguiendo carreteras reales.`);
  }

  // ── Construir línea continua de carretera a partir de una lista de IDs ───
  function buildPathRoadCoords(pathIds, fallbackCoords) {
    if (!pathIds || pathIds.length < 2) return fallbackCoords || [];

    const fullCoords = [];
    for (let i = 0; i < pathIds.length - 1; i++) {
      const seg = getSegmentPoints(pathIds[i], pathIds[i + 1]);
      if (seg && seg.length > 0) {
        if (fullCoords.length > 0) {
          // Evitar duplicar el punto de unión
          fullCoords.push(...seg.slice(1));
        } else {
          fullCoords.push(...seg);
        }
      }
    }

    return fullCoords.length > 0 ? fullCoords : (fallbackCoords || []);
  }

  // ── Dibujar ruta calculada ──────────────────────────────────────
  function drawRoute(result) {
    clearRoutes();

    if (!result || !result.found) {
      console.warn('[MapManager] No se encontró ruta para dibujar.');
      return;
    }

    const bounds = [];

    // ── 1. Ruta óptima (azul, gruesa, siguiendo carretera) ──
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
           <span style="color:#059669; font-size:0.85em; font-weight:600;">🛣️ Trazado exacto de carretera</span>
         </div>
       `);

      routeLayers.push(mainLine);
      mainRoadCoords.forEach(c => bounds.push(c));
    }

    // ── 2. Rutas alternativas (naranja, discontinua, siguiendo carretera) ──
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
             <span style="color:#059669; font-size:0.85em; font-weight:600;">🛣️ Trazado exacto de carretera</span>
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

    console.log('[MapManager] Ruta trazada sobre carreteras reales.');
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
    setBoundaries,
    setMapMode,
    drawCities,
    drawConnections,
    drawRoute,
    clearRoutes,
    invalidateSize
  };
})();
