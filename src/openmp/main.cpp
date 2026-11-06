// =============================================================================
// openmp/main.cpp
// Versión paralela del sistema de optimización de rutas usando OpenMP.
// Distribuye las consultas entre múltiples hilos de ejecución.
//
// Estrategia de paralelización:
//   - Cada consulta (par origen-destino) es independiente.
//   - Se usa #pragma omp parallel for para distribuir consultas entre hilos.
//   - Cada hilo ejecuta su propia instancia de Dijkstra con variables locales.
//   - Los resultados se escriben en posiciones pre-asignadas del vector
//     (results[i]), por lo que no hay condiciones de carrera.
//   - Se usa schedule(dynamic) para balance de carga, ya que consultas
//     diferentes pueden tener costos distintos.
//
// Uso: ./openmp <dataset> <num_hilos> [--verbose]
//   dataset:    small | medium | large
//   num_hilos:  número de hilos OpenMP (1, 2, 4, 8, 16)
//   --verbose:  muestra detalle de las primeras 10 consultas
//
// Ejemplo:
//   ./openmp small 4 --verbose
//   ./openmp large 8
// =============================================================================
#include "../common/graph.hpp"
#include "../common/route.hpp"
#include <iostream>
#include <iomanip>
#include <string>
#include <vector>
#include <algorithm>
#include <limits>
#include <omp.h>

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

// Rutas a los archivos CSV según el dataset
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
    int num_threads = 4;
    bool verbose = false;

    if (argc < 3) {
        std::cerr << "Uso: " << argv[0] << " <dataset> <num_hilos> [--verbose]"
                  << std::endl;
        std::cerr << "  dataset:    small | medium | large" << std::endl;
        std::cerr << "  num_hilos:  1, 2, 4, 8, 16" << std::endl;
        return 1;
    }

    dataset = argv[1];
    num_threads = std::stoi(argv[2]);

    for (int i = 3; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--verbose" || arg == "-v") {
            verbose = true;
        }
    }

    // Configurar el número de hilos OpenMP
    omp_set_num_threads(num_threads);

    std::cout << "============================================================" << std::endl;
    std::cout << "  SISTEMA DE OPTIMIZACION DE RUTAS - VERSION OPENMP" << std::endl;
    std::cout << "============================================================" << std::endl;
    std::cout << "Dataset: " << dataset << std::endl;
    std::cout << "Hilos solicitados: " << num_threads << std::endl;
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

    // --- Paso 2: Procesar consultas en paralelo con OpenMP ---
    int total_queries = static_cast<int>(queries.size());
    std::vector<QueryResult> results(total_queries);

    // Verificar el número real de hilos que OpenMP utilizará
    int actual_threads = 0;

    std::cout << "Procesando " << total_queries << " consultas con OpenMP..."
              << std::endl;

    // Medir tiempo con omp_get_wtime() (más preciso que chrono para OpenMP)
    double start_time = omp_get_wtime();

    // =========================================================================
    // SECCIÓN PARALELA: cada hilo procesa un subconjunto de consultas.
    //
    // - schedule(dynamic): asigna consultas a hilos dinámicamente. Un hilo que
    //   termina una consulta rápida toma la siguiente disponible, logrando
    //   mejor balance de carga que schedule(static).
    //
    // - No hay condiciones de carrera porque:
    //   1. Cada iteración escribe en results[i] (posición única).
    //   2. El grafo se lee pero nunca se modifica (acceso de solo lectura).
    //   3. Las variables internas de Dijkstra son locales a cada llamada.
    // =========================================================================
    #pragma omp parallel for schedule(dynamic)
    for (int i = 0; i < total_queries; i++) {
        // Registrar el número real de hilos (solo una vez)
        if (i == 0) {
            actual_threads = omp_get_num_threads();
        }

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

    double end_time = omp_get_wtime();
    double elapsed_s = end_time - start_time;
    double elapsed_ms = elapsed_s * 1000.0;

    std::cout << "Procesamiento completado." << std::endl;
    std::cout << "Hilos utilizados: " << actual_threads << std::endl;
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
    double avg_time_per_query = elapsed_ms / total_queries;

    std::cout << "============================================================" << std::endl;
    std::cout << "  RESULTADOS - VERSION OPENMP" << std::endl;
    std::cout << "============================================================" << std::endl;
    std::cout << std::fixed << std::setprecision(2);
    std::cout << std::endl;
    std::cout << "  Dataset:                " << dataset << std::endl;
    std::cout << "  Ciudades:               " << graph.num_cities() << std::endl;
    std::cout << "  Conexiones:             " << graph.num_edges() << std::endl;
    std::cout << "  Consultas procesadas:   " << total_queries << std::endl;
    std::cout << "  Rutas encontradas:      " << routes_found << std::endl;
    std::cout << "  Rutas no encontradas:   " << routes_not_found << std::endl;
    std::cout << "  Alternativas totales:   " << total_alternatives << std::endl;
    std::cout << std::endl;
    std::cout << "  Distancia promedio:     " << avg_distance << " km" << std::endl;
    std::cout << "  Distancia minima:       " << min_distance << " km" << std::endl;
    std::cout << "  Distancia maxima:       " << max_distance << " km" << std::endl;
    std::cout << std::endl;
    std::cout << "  --- Tiempos de Ejecucion ---" << std::endl;
    std::cout << "  Modo:                   OpenMP (" << actual_threads << " hilos)" << std::endl;
    std::cout << "  Tiempo total:           " << elapsed_ms << " ms ("
              << elapsed_s << " s)" << std::endl;
    std::cout << "  Tiempo por consulta:    " << avg_time_per_query << " ms" << std::endl;
    std::cout << std::endl;

    // --- Paso 5: Salida CSV para benchmarking ---
    std::cout << "  --- Linea CSV para benchmark ---" << std::endl;
    std::cout << "  openmp," << dataset << "," << actual_threads << ","
              << total_queries << "," << std::setprecision(4) << elapsed_ms
              << "," << routes_found << std::endl;
    std::cout << std::endl;
    std::cout << "============================================================" << std::endl;

    return 0;
}
