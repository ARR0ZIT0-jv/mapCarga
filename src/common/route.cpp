// =============================================================================
// route.cpp
// Implementación de Dijkstra y búsqueda de rutas alternativas.
// =============================================================================
#include "route.hpp"
#include <queue>
#include <limits>
#include <algorithm>
#include <fstream>
#include <sstream>
#include <iostream>
#include <iomanip>

// Constante para representar distancia infinita
static const double INF = std::numeric_limits<double>::infinity();

// -----------------------------------------------------------------------------
// Implementación del algoritmo de Dijkstra.
//
// Utiliza una cola de prioridad (min-heap) para explorar siempre el nodo
// con la menor distancia acumulada. Reconstruye la ruta usando un vector
// de predecesores.
//
// Parámetros:
//   graph           - Grafo de la red de transporte
//   origin          - ID de la ciudad de origen
//   destination     - ID de la ciudad de destino
//   blocked_edges   - Aristas a ignorar durante la búsqueda (opcional)
//
// Retorna:
//   RouteResult con la ruta encontrada, distancia total y flag de éxito.
// -----------------------------------------------------------------------------
RouteResult dijkstra(const Graph& graph, int origin, int destination,
                     const std::set<std::pair<int,int>>& blocked_edges) {

    RouteResult result;
    result.origin = origin;
    result.destination = destination;
    result.total_distance = INF;
    result.found = false;

    int n = graph.num_cities();

    // Validar IDs de entrada
    if (origin < 0 || origin >= n || destination < 0 || destination >= n) {
        return result;
    }

    // Caso trivial: origen igual al destino
    if (origin == destination) {
        result.path.push_back(origin);
        result.total_distance = 0.0;
        result.found = true;
        return result;
    }

    // Vectores de distancia mínima y predecesor
    std::vector<double> dist(n, INF);
    std::vector<int> prev(n, -1);

    // Cola de prioridad: pares (distancia, nodo), menor distancia primero
    // Se usa greater<> para convertir el max-heap por defecto en min-heap
    std::priority_queue<std::pair<double, int>,
                        std::vector<std::pair<double, int>>,
                        std::greater<std::pair<double, int>>> pq;

    dist[origin] = 0.0;
    pq.emplace(0.0, origin);

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();

        // Si ya encontramos una distancia mejor, ignorar esta entrada
        if (d > dist[u]) continue;

        // Si llegamos al destino, podemos terminar
        if (u == destination) break;

        // Explorar vecinos
        for (const auto& [v, weight] : graph.get_neighbors(u)) {
            // Verificar si esta arista está bloqueada
            if (!blocked_edges.empty()) {
                auto edge = std::make_pair(std::min(u, v), std::max(u, v));
                if (blocked_edges.count(edge)) continue;
            }

            double new_dist = dist[u] + weight;
            if (new_dist < dist[v]) {
                dist[v] = new_dist;
                prev[v] = u;
                pq.emplace(new_dist, v);
            }
        }
    }

    // Reconstruir la ruta si se encontró un camino
    if (dist[destination] < INF) {
        result.found = true;
        result.total_distance = dist[destination];

        // Reconstruir la ruta desde el destino al origen usando predecesores
        std::vector<int> path;
        for (int node = destination; node != -1; node = prev[node]) {
            path.push_back(node);
        }
        // Invertir para obtener la ruta desde el origen
        std::reverse(path.begin(), path.end());
        result.path = path;
    }

    return result;
}

// -----------------------------------------------------------------------------
// Búsqueda de rutas alternativas usando el método de Yen simplificado.
//
// Estrategia:
//   1. Calcular la ruta óptima con Dijkstra.
//   2. Para cada arista (u, v) de la ruta óptima, bloquearla y recalcular.
//   3. Recopilar rutas únicas y retornar las k mejores.
//
// Esto genera alternativas que difieren en al menos una arista respecto
// a la ruta óptima, simulando "desvíos" por caminos alternativos.
// -----------------------------------------------------------------------------
std::vector<RouteResult> find_alternative_routes(const Graph& graph,
                                                  int origin, int destination,
                                                  int k) {
    std::vector<RouteResult> all_routes;

    // Paso 1: Obtener la ruta óptima
    RouteResult optimal = dijkstra(graph, origin, destination);
    if (!optimal.found) {
        return all_routes; // No hay ruta, no hay alternativas
    }

    all_routes.push_back(optimal);

    // Paso 2: Generar alternativas bloqueando cada arista de la ruta óptima
    for (size_t i = 0; i + 1 < optimal.path.size(); i++) {
        int u = optimal.path[i];
        int v = optimal.path[i + 1];

        // Bloquear la arista (u, v) — se normaliza con min/max
        std::set<std::pair<int,int>> blocked;
        blocked.insert(std::make_pair(std::min(u, v), std::max(u, v)));

        RouteResult alt = dijkstra(graph, origin, destination, blocked);
        if (alt.found && alt.path != optimal.path) {
            all_routes.push_back(alt);
        }
    }

    // Paso 3: Eliminar rutas duplicadas
    // Dos rutas son iguales si tienen la misma secuencia de nodos
    std::sort(all_routes.begin(), all_routes.end(),
              [](const RouteResult& a, const RouteResult& b) {
                  return a.total_distance < b.total_distance;
              });

    std::vector<RouteResult> unique_routes;
    for (const auto& route : all_routes) {
        bool is_duplicate = false;
        for (const auto& existing : unique_routes) {
            if (route.path == existing.path) {
                is_duplicate = true;
                break;
            }
        }
        if (!is_duplicate) {
            unique_routes.push_back(route);
            if (static_cast<int>(unique_routes.size()) >= k) break;
        }
    }

    return unique_routes;
}

// -----------------------------------------------------------------------------
// Carga consultas de ruta desde un archivo CSV.
// Formato esperado: origen_id,destino_id
// -----------------------------------------------------------------------------
std::vector<Query> load_queries(const std::string& filename) {
    std::vector<Query> queries;
    std::ifstream file(filename);

    if (!file.is_open()) {
        std::cerr << "Error: No se pudo abrir el archivo de consultas: "
                  << filename << std::endl;
        return queries;
    }

    std::string line;
    // Saltar encabezado
    std::getline(file, line);

    while (std::getline(file, line)) {
        if (line.empty()) continue;

        std::stringstream ss(line);
        std::string token;
        Query q;

        std::getline(ss, token, ',');
        q.origin = std::stoi(token);

        std::getline(ss, token, ',');
        q.destination = std::stoi(token);

        queries.push_back(q);
    }

    file.close();
    return queries;
}

// -----------------------------------------------------------------------------
// Imprime el resultado de una búsqueda de ruta de forma legible.
// Muestra: origen, destino, ruta paso a paso y distancia total.
// -----------------------------------------------------------------------------
void print_route(const Graph& graph, const RouteResult& result) {
    if (!result.found) {
        std::cout << "  No se encontro ruta de "
                  << graph.get_city(result.origin).name << " a "
                  << graph.get_city(result.destination).name << std::endl;
        return;
    }

    std::cout << "  Ruta: ";
    for (size_t i = 0; i < result.path.size(); i++) {
        std::cout << graph.get_city(result.path[i]).name;
        if (i + 1 < result.path.size()) {
            std::cout << " -> ";
        }
    }
    std::cout << std::endl;
    std::cout << "  Distancia total: " << std::fixed << std::setprecision(1)
              << result.total_distance << " km" << std::endl;
    std::cout << "  Ciudades en la ruta: " << result.path.size() << std::endl;
}
