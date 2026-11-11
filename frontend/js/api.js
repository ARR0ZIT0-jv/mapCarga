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
   * GET /api/cities
   * @returns {Promise<Array>} Array de objetos ciudad
   */
  getCities: async () => {
    try {
      const response = await fetch(`${getApiBase()}/cities`);
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] getCities error:', error);
      throw new Error(`No se pudo conectar a ${getApiBase()}. ¿Está el servidor ejecutándose?`);
    }
  },

  /**
   * Obtiene la lista de rutas/carreteras registradas.
   * GET /api/routes
   * @returns {Promise<Array>} Array de objetos ruta
   */
  getRoutes: async () => {
    try {
      const response = await fetch(`${getApiBase()}/routes`);
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] getRoutes error:', error);
      throw new Error(`No se pudo obtener la lista de rutas desde ${getApiBase()}.`);
    }
  },

  /**
   * Calcula la ruta más corta entre origen y destino usando Dijkstra (C++).
   * POST /api/route/shortest
   * @param {number} originId    - ID de la ciudad de origen
   * @param {number} destinationId - ID de la ciudad de destino
   * @returns {Promise<Object>} Resultado con path, distancia, tiempo y alternativas
   */
  findShortestRoute: async (originId, destinationId) => {
    try {
      const response = await fetch(`${getApiBase()}/route/shortest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          origin_id: parseInt(originId),
          destination_id: parseInt(destinationId)
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Error HTTP ${response.status}: ${text}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] findShortestRoute error:', error);
      if (error.message.startsWith('Error HTTP')) throw error;
      throw new Error(`No se pudo calcular la ruta en ${getApiBase()}. Verifica que el servidor esté activo.`);
    }
  },

  /**
   * Obtiene estadísticas del sistema (ciudades, rutas, consultas).
   * GET /api/stats
   * @returns {Promise<Object>} Objeto con estadísticas
   */
  getStats: async () => {
    try {
      const response = await fetch(`${getApiBase()}/stats`);
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] getStats error:', error);
      throw new Error('No se pudo obtener las estadísticas.');
    }
  }
};
