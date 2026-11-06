// =============================================================================
// sequential/main.cpp
// Versión secuencial del sistema de optimización de rutas.
// Procesa todas las consultas con un solo hilo.
// Esta versión sirve como referencia (baseline) para comparar rendimiento
// contra las versiones paralela (OpenMP) y distribuida (MPI).
//
// Uso: ./sequential <dataset> [--verbose]
//   dataset:  small | medium | large
//   --verbose: muestra detalle de las primeras 10 consultas
//
// Ejemplo:
//   ./sequential small --verbose
//   ./sequential medium
// =============================================================================
#include "../common/graph.hpp"
#include "../common/route.hpp"
#include <iostream>
#include <iomanip>
#include <chrono>
#include <string>
#include <vector>
#include <algorithm>
#include <numeric>

// Número máximo de consultas a mostrar en detalle (modo verbose)
static const int MAX_VERBOSE_QUERIES = 10;
// Número de rutas alternativas a buscar por consulta
static const int K_ALTERNATIVES = 3;

// Estructura para almacenar resultados completos de una consulta
struct QueryResult {
    Query query;
    RouteResult best_route;
    std::vector<RouteResult> alternatives;
};

// -----------------------------------------------------------------------------
// Determina las rutas a los archivos CSV según el dataset seleccionado.
// Para "small" se usan los datos reales; para "medium" y "large" los sintéticos.
// -----------------------------------------------------------------------------
struct DataPaths {
    std::string cities;
    std::string routes;
    std::string queries;
};

DataPaths get_data_paths(const std::string& dataset) {
    DataPaths paths;
    if (dataset == "small") {
        paths.cities  = "data/cities.csv";
        paths.routes  = "data/routes.csv";
        paths.queries = "data/queries_small.csv";
    } else if (dataset == "medium") {
        paths.cities  = "data/cities_medium.csv";
        paths.routes  = "data/routes_medium.csv";
        paths.queries = "data/queries_medium.csv";
    } else if (dataset == "large") {
        paths.cities  = "data/cities_large.csv";
        paths.routes  = "data/routes_large.csv";
        paths.queries = "data/queries_large.csv";
    } else {
        std::cerr << "Error: Dataset no reconocido: " << dataset << std::endl;
        std::cerr << "Opciones: small, medium, large" << std::endl;
        exit(1);
    }
    return paths;
}

int main(int argc, char* argv[]) {
    // --- Parsear argumentos ---
    std::string dataset = "small";
    bool verbose = false;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--verbose" || arg == "-v") {
            verbose = true;
        } else {
            dataset = arg;
        }
    }

    std::cout << "============================================================" << std::endl;
    std::cout << "  SISTEMA DE OPTIMIZACION DE RUTAS - VERSION SECUENCIAL" << std::endl;
    std::cout << "============================================================" << std::endl;
    std::cout << "Dataset: " << dataset << std::endl;
    std::cout << "Modo: secuencial (1 hilo)" << std::endl;
    std::cout << std::endl;

    // --- Paso 1: Cargar datos ---
    DataPaths paths = get_data_paths(dataset);

    Graph graph;
    if (!graph.load_cities(paths.cities)) return 1;
    if (!graph.load_routes(paths.routes)) return 1;

    std::cout << "Grafo cargado: " << graph.num_cities() << " ciudades, "
              << graph.num_edges() << " conexiones" << std::endl;

    std::vector<Query> queries = load_queries(paths.queries);
    if (queries.empty()) {
        std::cerr << "Error: No se cargaron consultas." << std::endl;
        return 1;
    }
    std::cout << "Consultas cargadas: " << queries.size() << std::endl;
    std::cout << std::endl;

    // --- Paso 2: Procesar todas las consultas secuencialmente ---
    std::cout << "Procesando " << queries.size() << " consultas..." << std::endl;

    std::vector<QueryResult> results(queries.size());

    // Medir tiempo de ejecución (solo el procesamiento, no la carga)
    auto start_time = std::chrono::high_resolution_clock::now();

    for (size_t i = 0; i < queries.size(); i++) {
        results[i].query = queries[i];

        // Buscar ruta óptima y alternativas
        auto routes = find_alternative_routes(graph,
                                               queries[i].origin,
                                               queries[i].destination,
                                               K_ALTERNATIVES);

        if (!routes.empty()) {
            results[i].best_route = routes[0];
            results[i].alternatives.assign(routes.begin() + 1, routes.end());
        } else {
            results[i].best_route.origin = queries[i].origin;
            results[i].best_route.destination = queries[i].destination;
            results[i].best_route.found = false;
            results[i].best_route.total_distance = 0.0;
        }
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    double elapsed_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();
    double elapsed_s = elapsed_ms / 1000.0;

    std::cout << "Procesamiento completado." << std::endl;
    std::cout << std::endl;

    // --- Paso 3: Mostrar resultados detallados (modo verbose) ---
    if (verbose) {
        int show_count = std::min(static_cast<int>(results.size()), MAX_VERBOSE_QUERIES);
        std::cout << "============================================================" << std::endl;
        std::cout << "  DETALLE DE PRIMERAS " << show_count << " CONSULTAS" << std::endl;
        std::cout << "============================================================" << std::endl;

        for (int i = 0; i < show_count; i++) {
            const auto& qr = results[i];
            std::cout << std::endl;
            std::cout << "--- Consulta " << (i + 1) << ": "
                      << graph.get_city(qr.query.origin).name << " -> "
                      << graph.get_city(qr.query.destination).name << " ---"
                      << std::endl;

            if (qr.best_route.found) {
                std::cout << "  Ruta optima:" << std::endl;
                print_route(graph, qr.best_route);

                if (!qr.alternatives.empty()) {
                    std::cout << "  Rutas alternativas: " << qr.alternatives.size()
                              << std::endl;
                    for (size_t j = 0; j < qr.alternatives.size(); j++) {
                        std::cout << "  Alternativa " << (j + 1) << ":" << std::endl;
                        print_route(graph, qr.alternatives[j]);
                    }
                }
            } else {
                std::cout << "  No se encontro ruta." << std::endl;
            }
        }
        std::cout << std::endl;
    }

    // --- Paso 4: Estadísticas generales ---
    int routes_found = 0;
    int routes_not_found = 0;
    double total_distance = 0.0;
    double min_distance = std::numeric_limits<double>::infinity();
    double max_distance = 0.0;
    int total_alternatives = 0;

    for (const auto& qr : results) {
        if (qr.best_route.found) {
            routes_found++;
            total_distance += qr.best_route.total_distance;
            min_distance = std::min(min_distance, qr.best_route.total_distance);
            max_distance = std::max(max_distance, qr.best_route.total_distance);
            total_alternatives += static_cast<int>(qr.alternatives.size());
        } else {
            routes_not_found++;
        }
    }

    double avg_distance = (routes_found > 0) ? total_distance / routes_found : 0.0;
    double avg_time_per_query = elapsed_ms / queries.size();

    std::cout << "============================================================" << std::endl;
    std::cout << "  RESULTADOS - VERSION SECUENCIAL" << std::endl;
    std::cout << "============================================================" << std::endl;
    std::cout << std::fixed << std::setprecision(2);
    std::cout << std::endl;
    std::cout << "  Dataset:                " << dataset << std::endl;
    std::cout << "  Ciudades:               " << graph.num_cities() << std::endl;
    std::cout << "  Conexiones:             " << graph.num_edges() << std::endl;
    std::cout << "  Consultas procesadas:   " << queries.size() << std::endl;
    std::cout << "  Rutas encontradas:      " << routes_found << std::endl;
    std::cout << "  Rutas no encontradas:   " << routes_not_found << std::endl;
    std::cout << "  Alternativas totales:   " << total_alternatives << std::endl;
    std::cout << std::endl;
    std::cout << "  Distancia promedio:     " << avg_distance << " km" << std::endl;
    std::cout << "  Distancia minima:       " << min_distance << " km" << std::endl;
    std::cout << "  Distancia maxima:       " << max_distance << " km" << std::endl;
    std::cout << std::endl;
    std::cout << "  --- Tiempos de Ejecucion ---" << std::endl;
    std::cout << "  Modo:                   Secuencial (1 hilo)" << std::endl;
    std::cout << "  Tiempo total:           " << elapsed_ms << " ms ("
              << elapsed_s << " s)" << std::endl;
    std::cout << "  Tiempo por consulta:    " << avg_time_per_query << " ms" << std::endl;
    std::cout << std::endl;

    // --- Paso 5: Salida CSV para benchmarking ---
    // Formato: version,dataset,hilos/procesos,consultas,tiempo_ms,rutas_encontradas
    std::cout << "  --- Linea CSV para benchmark ---" << std::endl;
    std::cout << "  sequential," << dataset << ",1," << queries.size() << ","
              << std::setprecision(4) << elapsed_ms << "," << routes_found << std::endl;
    std::cout << std::endl;
    std::cout << "============================================================" << std::endl;

    return 0;
}
