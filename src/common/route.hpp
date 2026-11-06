// =============================================================================
// route.hpp
// Algoritmos de búsqueda de rutas: Dijkstra y rutas alternativas.
// =============================================================================
#ifndef ROUTE_HPP
#define ROUTE_HPP

#include "graph.hpp"
#include <vector>
#include <string>
#include <set>
#include <utility>

// Resultado de una búsqueda de ruta
struct RouteResult {
    int origin;                // ID de la ciudad de origen
    int destination;           // ID de la ciudad de destino
    std::vector<int> path;     // Secuencia de IDs de ciudades en la ruta
    double total_distance;     // Distancia total en km
    bool found;                // true si se encontró una ruta válida
};

// Consulta de ruta (par origen-destino)
struct Query {
    int origin;
    int destination;
};

// -----------------------------------------------------------------------------
// Algoritmo de Dijkstra
// Encuentra el camino mínimo entre origin y destination en el grafo.
// blocked_edges: conjunto opcional de aristas a ignorar (para rutas alternativas).
//   Cada par (u,v) bloquea la arista en ambas direcciones.
// Complejidad: O((V + E) log V) con cola de prioridad.
// -----------------------------------------------------------------------------
RouteResult dijkstra(const Graph& graph, int origin, int destination,
                     const std::set<std::pair<int,int>>& blocked_edges = {});

// -----------------------------------------------------------------------------
// Búsqueda de rutas alternativas (Yen simplificado)
// Encuentra hasta k rutas distintas entre origin y destination.
// 1. Calcula la ruta óptima con Dijkstra.
// 2. Para cada arista de la ruta óptima, la bloquea y recalcula.
// 3. Retorna las k mejores rutas distintas ordenadas por distancia.
// -----------------------------------------------------------------------------
std::vector<RouteResult> find_alternative_routes(const Graph& graph,
                                                  int origin, int destination,
                                                  int k = 3);

// Carga consultas desde un archivo CSV (formato: origen_id,destino_id)
std::vector<Query> load_queries(const std::string& filename);

// Imprime el resultado de una ruta de forma legible
void print_route(const Graph& graph, const RouteResult& result);

#endif // ROUTE_HPP
