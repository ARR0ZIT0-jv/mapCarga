/**
 * map.js — Módulo de gestión del mapa interactivo con Leaflet
 * TEL420 – Sistemas Paralelos
 * Proyecto: Optimizador de Rutas de Transporte - Gran Chaco
 */

const MapManager = (() => {
  // ── Estado interno ──────────────────────────────────────────────
  let map = null;
  let cityMarkers = [];
  let connectionLines = [];
  let routeLayers = [];       // Capas de la ruta calculada (se limpian con clearRoutes)
  let citiesData = [];
  let routesData = [];

  // ── Configuración visual ────────────────────────────────────────
  const YACUIBA_COORDS = [-21.9667, -63.6833];
  const INITIAL_ZOOM = 6;

  const COLORS = {
    connection: '#94a3b8',
    routeMain:  '#3b82f6',
    routeAlt:   '#f97316',
    markerStart: '#22c55e',
    markerEnd:   '#ef4444',
    markerCity:  '#6366f1',
    markerYacuiba: '#eab308'
  };

  // ── Iconos personalizados ───────────────────────────────────────
  function createCityIcon(isYacuiba = false, isEndpoint = false, type = 'default') {
    let color = COLORS.markerCity;
    let size = 10;
    let border = '2px solid #fff';

    if (isYacuiba)   { color = COLORS.markerYacuiba; size = 14; }
    if (type === 'start') { color = COLORS.markerStart; size = 14; }
    if (type === 'end')   { color = COLORS.markerEnd;   size = 14; }

    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px; height:${size}px;
        background:${color};
        border:${border};
        border-radius:50%;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  // ── Inicialización del mapa ─────────────────────────────────────
  function init(containerId = 'map') {
    if (map) return; // Ya inicializado

    map = L.map(containerId, {
      center: YACUIBA_COORDS,
      zoom: INITIAL_ZOOM,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(map);

    console.log('[MapManager] Mapa inicializado.');
  }

  // ── Dibujar ciudades ────────────────────────────────────────────
  function drawCities(cities) {
    // Limpiar marcadores anteriores
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
            <strong style="font-size:1em;">${city.name}</strong><br>
            <span style="color:#64748b; font-size:0.85em;">${city.country}</span><br>
            <small style="color:#94a3b8;">ID: ${city.id} | ${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}</small>
          </div>
        `);

      if (isYacuiba) {
        // Tooltip permanente para Yacuiba (ciudad referencia)
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

  // ── Dibujar conexiones (carreteras) ────────────────────────────
  function drawConnections(cities, routes) {
    // Limpiar conexiones anteriores
    connectionLines.forEach(l => map.removeLayer(l));
    connectionLines = [];
    routesData = routes;

    // Mapa rápido id→ciudad
    const cityById = {};
    cities.forEach(c => { cityById[c.id] = c; });

    routes.forEach(route => {
      const from = cityById[route.from_id];
      const to   = cityById[route.to_id];
      if (!from || !to) return;

      const line = L.polyline(
        [[from.lat, from.lon], [to.lat, to.lon]],
        {
          color: COLORS.connection,
          weight: 1.5,
          opacity: 0.6,
          dashArray: null
        }
      ).addTo(map)
       .bindPopup(`
         <small style="font-family:sans-serif;">
           <strong>${from.name} ↔ ${to.name}</strong><br>
           ${route.distance_km} km (estimado)
         </small>
       `);

      connectionLines.push(line);
    });

    console.log(`[MapManager] ${routes.length} conexiones dibujadas.`);
  }

  // ── Cache de geometría de carreteras reales (OSRM) ──────────────
  const geometryCache = new Map();

  /**
   * Obtiene la geometría real de las carreteras a través de OSRM
   * a partir de la secuencia de coordenadas de las ciudades.
   * @param {Array<Array<number>>} coords - Array de [lat, lon]
   * @returns {Promise<Array<Array<number>>>} Array de [lat, lon] siguiendo curvas de carretera
   */
  async function fetchRoadGeometry(coords) {
    if (!coords || coords.length < 2) return coords;

    const cacheKey = coords.map(c => `${c[0].toFixed(4)},${c[1].toFixed(4)}`).join('|');
    if (geometryCache.has(cacheKey)) {
      return geometryCache.get(cacheKey);
    }

    try {
      // OSRM espera {lon},{lat};{lon},{lat}...
      const waypoints = coords.map(c => `${c[1]},${c[0]}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`OSRM status ${response.status}`);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        // GeoJSON entrega [lon, lat] -> Convertir a formato Leaflet [lat, lon]
        const roadPoints = data.routes[0].geometry.coordinates.map(pt => [pt[1], pt[0]]);
        geometryCache.set(cacheKey, roadPoints);
        console.log(`[MapManager] Geometría de carretera obtenida: ${roadPoints.length} puntos reales.`);
        return roadPoints;
      }
    } catch (err) {
      console.warn('[MapManager] OSRM no disponible o tiempo agotado, usando tramos directos:', err.message);
    }

    return coords; // Retorna los puntos directos en caso de fallback
  }

  // ── Dibujar ruta calculada ──────────────────────────────────────
  function drawRoute(result) {
    clearRoutes();

    if (!result || !result.found) {
      console.warn('[MapManager] No se encontró ruta para dibujar.');
      return;
    }

    const bounds = [];
    let mainLine = null;
    const altLines = [];

    // ── 1. Ruta principal (azul, gruesa) ──
    if (result.path_coords && result.path_coords.length > 1) {
      mainLine = L.polyline(result.path_coords, {
        color: COLORS.routeMain,
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map)
       .bindPopup(`
         <div style="font-family:sans-serif;">
           <strong>🔵 Ruta óptima</strong><br>
           Distancia: <strong>${result.total_distance.toFixed(1)} km</strong><br>
           Tiempo cálculo: ${result.execution_time_ms.toFixed(3)} ms<br>
           Paradas: ${result.path_names.join(' → ')}<br>
           <small style="color:#059669;">🛣️ Trazado sobre carreteras reales</small>
         </div>
       `);

      routeLayers.push(mainLine);
      result.path_coords.forEach(c => bounds.push(c));

      // Asincrónicamente sustituir la línea recta por la geometría real de carretera
      fetchRoadGeometry(result.path_coords).then(roadCoords => {
        if (roadCoords && roadCoords.length > 0 && mainLine) {
          mainLine.setLatLngs(roadCoords);
        }
      });
    }

    // ── 2. Rutas alternativas (naranja, punteado) ──
    if (result.alternatives && result.alternatives.length > 0) {
      result.alternatives.forEach((alt, idx) => {
        if (!alt.path_coords || alt.path_coords.length < 2) return;

        const altLine = L.polyline(alt.path_coords, {
          color: COLORS.routeAlt,
          weight: 4,
          opacity: 0.75,
          dashArray: '8 8',
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map)
         .bindPopup(`
           <div style="font-family:sans-serif;">
             <strong>🟠 Alternativa ${idx + 1}</strong><br>
             Distancia: ${alt.total_distance.toFixed(1)} km<br>
             Paradas: ${alt.path_names.join(' → ')}<br>
             <small style="color:#059669;">🛣️ Trazado sobre carreteras reales</small>
           </div>
         `);

        routeLayers.push(altLine);
        altLines.push({ line: altLine, coords: alt.path_coords });
        alt.path_coords.forEach(c => bounds.push(c));

        // Asincrónicamente obtener carreteras para las alternativas
        fetchRoadGeometry(alt.path_coords).then(altRoadCoords => {
          if (altRoadCoords && altRoadCoords.length > 0 && altLine) {
            altLine.setLatLngs(altRoadCoords);
          }
        });
      });
    }

    // ── Marcadores inicio/fin ──
    if (result.path_coords && result.path_coords.length >= 2) {
      const startCoord = result.path_coords[0];
      const endCoord   = result.path_coords[result.path_coords.length - 1];
      const startName  = result.path_names[0];
      const endName    = result.path_names[result.path_names.length - 1];

      const startMarker = L.marker(startCoord, { icon: createCityIcon(false, false, 'start') })
        .addTo(map)
        .bindPopup(`<strong>🟢 Origen: ${startName}</strong>`);

      const endMarker = L.marker(endCoord, { icon: createCityIcon(false, false, 'end') })
        .addTo(map)
        .bindPopup(`<strong>🔴 Destino: ${endName}</strong>`);

      routeLayers.push(startMarker, endMarker);
    }

    // ── Ajustar zoom a la ruta ──
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }

    console.log('[MapManager] Ruta dibujada en el mapa.');
  }

  // ── Limpiar capas de ruta (conservar ciudades y conexiones) ────
  function clearRoutes() {
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];
    console.log('[MapManager] Rutas limpiadas.');
  }

  // ── Forzar redimensionado (necesario al cambiar de tab) ────────
  function invalidateSize() {
    if (map) map.invalidateSize();
  }

  // ── API pública ─────────────────────────────────────────────────
  return { init, drawCities, drawConnections, drawRoute, clearRoutes, invalidateSize };
})();
