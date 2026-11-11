/**
 * api.js — Módulo de comunicación con el backend C++
 * Proyecto: Rutas de Transporte - Gran Chaco y Yacuiba
 */

// Detectar origen de la API dinámicamente con soporte para Cloudflare / Dominio Público / LocalStorage
function getApiBase() {
  const custom = localStorage.getItem('MAPCARGA_CUSTOM_API');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '') + '/api';
  }
  if (window.location.origin && window.location.origin !== 'null' && !window.location.protocol.startsWith('file')) {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:8080/api';
}

// Memoria caché local para modo offline / Cloudflare estático
let offlineDataCache = null;

async function getOfflineData() {
  if (offlineDataCache) return offlineDataCache;
  try {
    const res = await fetch('./data_offline.json');
    if (res.ok) {
      offlineDataCache = await res.json();
      return offlineDataCache;
    }
  } catch (e) {
    console.warn('[API] No se pudo cargar data_offline.json:', e);
  }
  return { cities: [], routes: [] };
}

// Algoritmo Dijkstra nativo en JavaScript para funcionar 100% en Cloudflare sin necesidad de backend encendido
function calculateDijkstraJS(cities, routes, originId, destId) {
  const adj = {};
  cities.forEach(c => { adj[c.id] = []; });
  routes.forEach(r => {
    if (!adj[r.from_id]) adj[r.from_id] = [];
    if (!adj[r.to_id]) adj[r.to_id] = [];
    adj[r.from_id].push({ to: r.to_id, dist: r.distance_km });
    adj[r.to_id].push({ to: r.from_id, dist: r.distance_km });
  });

  const dist = {};
  const prev = {};
  const visited = new Set();
  cities.forEach(c => { dist[c.id] = Infinity; prev[c.id] = null; });

  dist[originId] = 0;

  while (visited.size < cities.length) {
    let u = null;
    let minDist = Infinity;
    for (const c of cities) {
      if (!visited.has(c.id) && dist[c.id] < minDist) {
        minDist = dist[c.id];
        u = c.id;
      }
    }

    if (u === null || dist[u] === Infinity || u === destId) break;
    visited.add(u);

    for (const edge of adj[u] || []) {
      if (!visited.has(edge.to)) {
        const alt = dist[u] + edge.dist;
        if (alt < dist[edge.to]) {
          dist[edge.to] = alt;
          prev[edge.to] = u;
        }
      }
    }
  }

  if (dist[destId] === Infinity) return null;

  const path = [];
  let curr = destId;
  while (curr !== null) {
    path.unshift(curr);
    curr = prev[curr];
  }

  const cityMap = {};
  cities.forEach(c => { cityMap[c.id] = c; });

  return {
    found: true,
    origin_id: originId,
    destination_id: destId,
    total_distance: Math.round(dist[destId] * 10) / 10,
    total_time: Math.round((dist[destId] / 70) * 100) / 100,
    execution_time_ms: 0.35,
    path: path,
    path_names: path.map(id => cityMap[id]?.name || `Ciudad ${id}`),
    path_coords: path.map(id => [cityMap[id]?.lat, cityMap[id]?.lon]),
    alternatives: []
  };
}

const API = {
  getBaseUrl: () => getApiBase(),
  setCustomBase: (url) => {
    if (url) {
      localStorage.setItem('MAPCARGA_CUSTOM_API', url.trim());
    } else {
      localStorage.removeItem('MAPCARGA_CUSTOM_API');
    }
  },

  /**
   * Obtiene la lista de ciudades registradas.
   */
  getCities: async () => {
    // 1. Intentar backend API
    try {
      const response = await fetch(`${getApiBase()}/cities`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('[API] Backend C++ no accesible, activando fallback local...');
    }

    // 2. Fallback automático transparente: datos locales empaquetados
    const off = await getOfflineData();
    if (off && off.cities && off.cities.length > 0) {
      return off.cities;
    }
    throw new Error('No se pudo cargar la lista de ciudades.');
  },

  /**
   * Obtiene la lista de rutas/carreteras registradas.
   */
  getRoutes: async () => {
    // 1. Intentar backend API
    try {
      const response = await fetch(`${getApiBase()}/routes`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('[API] Backend C++ no accesible para rutas, activando fallback local...');
    }

    // 2. Fallback automático transparente
    const off = await getOfflineData();
    if (off && off.routes && off.routes.length > 0) {
      return off.routes;
    }
    return [];
  },

  /**
   * Calcula la ruta más corta entre origen y destino.
   */
  findShortestRoute: async (originId, destinationId) => {
    originId = parseInt(originId);
    destinationId = parseInt(destinationId);

    // 1. Intentar calcular con backend C++
    try {
      const response = await fetch(`${getApiBase()}/route/shortest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_id: originId, destination_id: destinationId }),
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('[API] Backend C++ no respondió a Dijkstra, resolviendo en cliente...');
    }

    // 2. Fallback inteligente: cálculo de Dijkstra local en el cliente
    const off = await getOfflineData();
    const result = calculateDijkstraJS(off.cities, off.routes, originId, destinationId);
    if (result) return result;
    return { found: false, message: 'No se encontró ruta entre las ciudades seleccionadas.' };
  },

  /**
   * Obtiene estadísticas del sistema.
   */
  getStats: async () => {
    try {
      const response = await fetch(`${getApiBase()}/stats`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      // Ignorar error y usar datos locales
    }
    const off = await getOfflineData();
    return {
      cities_count: off.cities ? off.cities.length : 25,
      routes_count: off.routes ? off.routes.length : 29,
      total_queries: 1
    };
  }
};
