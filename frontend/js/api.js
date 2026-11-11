/**
 * api.js — Módulo de comunicación con el backend C++
 * TEL420 – Sistemas Paralelos
 * Proyecto: Optimizador de Rutas de Transporte - Gran Chaco
 */

const API_BASE = 'http://localhost:8080/api';

const API = {
  /**
   * Obtiene la lista de ciudades registradas.
   * GET /api/cities
   * @returns {Promise<Array>} Array de objetos ciudad
   */
  getCities: async () => {
    try {
      const response = await fetch(`${API_BASE}/cities`);
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] getCities error:', error);
      throw new Error('No se pudo obtener la lista de ciudades. ¿Está el servidor ejecutándose?');
    }
  },

  /**
   * Obtiene la lista de rutas/carreteras registradas.
   * GET /api/routes
   * @returns {Promise<Array>} Array de objetos ruta
   */
  getRoutes: async () => {
    try {
      const response = await fetch(`${API_BASE}/routes`);
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] getRoutes error:', error);
      throw new Error('No se pudo obtener la lista de rutas. ¿Está el servidor ejecutándose?');
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
      const response = await fetch(`${API_BASE}/route/shortest`, {
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
      throw new Error('No se pudo calcular la ruta. Verifica que el servidor esté activo.');
    }
  },

  /**
   * Obtiene estadísticas del sistema (ciudades, rutas, consultas).
   * GET /api/stats
   * @returns {Promise<Object>} Objeto con estadísticas
   */
  getStats: async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`);
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] getStats error:', error);
      throw new Error('No se pudo obtener las estadísticas.');
    }
  },

  /**
   * Obtiene los resultados de benchmarking (Secuencial vs OpenMP vs OpenMPI).
   * GET /api/benchmark
   * @returns {Promise<Object>} Datos estructurados del benchmark
   */
  getBenchmarkData: async () => {
    try {
      const response = await fetch(`${API_BASE}/benchmark`);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn('[API] /api/benchmark falló, intentando archivo local:', err.message);
    }

    // Fallback directo al archivo estático si fuera necesario
    const localRes = await fetch('./benchmark_data.json');
    if (!localRes.ok) throw new Error('No se pudo cargar datos de benchmark.');
    return await localRes.json();
  }
};
