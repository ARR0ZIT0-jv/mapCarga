// =============================================================================
// mpi/main.cpp
// Versión distribuida del sistema de optimización de rutas usando OpenMPI.
//
// Estrategia de distribución:
//   1. Rank 0 (master): carga el grafo y las consultas desde CSV.
//   2. MPI_Bcast: envía el grafo serializado a todos los procesos.
//   3. MPI_Scatter: distribuye las consultas equitativamente entre procesos.
//   4. Cada proceso ejecuta Dijkstra + rutas alternativas para sus consultas.
//   5. MPI_Gather: recopila los resultados en el proceso master.
//   6. Rank 0 muestra los resultados consolidados.
//
// Comunicaciones utilizadas:
//   - MPI_Bcast (colectiva): distribuir el grafo
//   - MPI_Scatter (colectiva): dividir consultas
//   - MPI_Gather (colectiva): recopilar resultados
//   - MPI_Send/Recv (punto a punto): enviar rutas detalladas
//
// Uso: mpirun --hostfile /app/hostfile -np 3 ./mpi_solver <dataset>
//   dataset: small | medium | large
//
// Ejemplo:
//   mpirun -np 3 ./mpi_solver small
//   mpirun --hostfile /app/hostfile -np 3 ./mpi_solver large
// =============================================================================
#include "../common/graph.hpp"
#include "../common/route.hpp"
#include <mpi.h>
#include <iostream>
#include <iomanip>
#include <string>
#include <vector>
#include <algorithm>
#include <limits>
#include <cstring>

// Número de rutas alternativas a buscar por consulta
static const int K_ALTERNATIVES = 3;
// Máximo de consultas a mostrar en detalle
static const int MAX_VERBOSE_QUERIES = 10;

// Estructura plana para enviar/recibir resultados por MPI
// Solo contiene los datos numéricos; las rutas detalladas se envían aparte.
struct FlatResult {
    int origin;
    int destination;
    double best_distance;
    int best_path_length;
    int num_alternatives;
    int found;  // 1 = encontrada, 0 = no
};

// Rutas a archivos CSV según dataset
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
        paths.cities = ""; // Error
    }
    return paths;
}

int main(int argc, char* argv[]) {
    // --- Inicializar MPI ---
    MPI_Init(&argc, &argv);

    int rank, num_procs;
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &num_procs);

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

    DataPaths paths = get_data_paths(dataset);
    if (paths.cities.empty()) {
        if (rank == 0) {
            std::cerr << "Error: Dataset no reconocido: " << dataset << std::endl;
        }
        MPI_Finalize();
        return 1;
    }

    // ==========================================================================
    // PASO 1: El master (rank 0) carga los datos y prepara la distribución
    // ==========================================================================
    Graph graph;
    std::vector<Query> all_queries;
    int total_queries = 0;
    int num_cities = 0;

    // Datos del grafo para serialización
    std::vector<int> edge_data, edge_offsets;
    std::vector<double> edge_weights;
    // Datos de ciudades para serialización
    std::vector<int> city_ids;
    std::vector<double> city_coords;  // lat, lon intercalados
    // Nombres y países se envían como buffer de chars
    std::vector<char> names_buffer;
    std::vector<int> name_offsets;

    if (rank == 0) {
        std::cout << "============================================================" << std::endl;
        std::cout << "  SISTEMA DE OPTIMIZACION DE RUTAS - VERSION MPI" << std::endl;
        std::cout << "============================================================" << std::endl;
        std::cout << "Dataset: " << dataset << std::endl;
        std::cout << "Procesos MPI: " << num_procs << std::endl;
        std::cout << std::endl;

        // Cargar grafo
        if (!graph.load_cities(paths.cities) || !graph.load_routes(paths.routes)) {
            std::cerr << "Error al cargar datos." << std::endl;
            MPI_Abort(MPI_COMM_WORLD, 1);
        }

        num_cities = graph.num_cities();
        std::cout << "Grafo cargado: " << num_cities << " ciudades, "
                  << graph.num_edges() << " conexiones" << std::endl;

        // Cargar consultas
        all_queries = load_queries(paths.queries);
        total_queries = static_cast<int>(all_queries.size());
        std::cout << "Consultas cargadas: " << total_queries << std::endl;

        // Serializar el grafo (formato CSR)
        graph.serialize(edge_data, edge_weights, edge_offsets);

        // Serializar datos de ciudades
        city_ids.resize(num_cities);
        city_coords.resize(num_cities * 2);
        // Empaquetar nombres: "nombre\0pais\0nombre\0pais\0..."
        name_offsets.resize(num_cities + 1);
        name_offsets[0] = 0;
        for (int i = 0; i < num_cities; i++) {
            const City& c = graph.get_city(i);
            city_ids[i] = c.id;
            city_coords[i * 2] = c.latitude;
            city_coords[i * 2 + 1] = c.longitude;
            // Agregar nombre y país al buffer
            for (char ch : c.name) names_buffer.push_back(ch);
            names_buffer.push_back('\0');
            for (char ch : c.country) names_buffer.push_back(ch);
            names_buffer.push_back('\0');
            name_offsets[i + 1] = static_cast<int>(names_buffer.size());
        }
    }

    // ==========================================================================
    // PASO 2: Broadcast del grafo a todos los procesos (MPI_Bcast)
    // Todos los procesos necesitan el grafo completo para ejecutar Dijkstra.
    // ==========================================================================

    // Broadcast de metadatos
    MPI_Bcast(&num_cities, 1, MPI_INT, 0, MPI_COMM_WORLD);
    MPI_Bcast(&total_queries, 1, MPI_INT, 0, MPI_COMM_WORLD);

    // Broadcast de estructura del grafo (CSR)
    int num_edge_entries = 0;
    if (rank == 0) num_edge_entries = static_cast<int>(edge_data.size());
    MPI_Bcast(&num_edge_entries, 1, MPI_INT, 0, MPI_COMM_WORLD);

    if (rank != 0) {
        edge_data.resize(num_edge_entries);
        edge_weights.resize(num_edge_entries);
        edge_offsets.resize(num_cities + 1);
        city_ids.resize(num_cities);
        city_coords.resize(num_cities * 2);
    }

    MPI_Bcast(edge_data.data(), num_edge_entries, MPI_INT, 0, MPI_COMM_WORLD);
    MPI_Bcast(edge_weights.data(), num_edge_entries, MPI_DOUBLE, 0, MPI_COMM_WORLD);
    MPI_Bcast(edge_offsets.data(), num_cities + 1, MPI_INT, 0, MPI_COMM_WORLD);
    MPI_Bcast(city_ids.data(), num_cities, MPI_INT, 0, MPI_COMM_WORLD);
    MPI_Bcast(city_coords.data(), num_cities * 2, MPI_DOUBLE, 0, MPI_COMM_WORLD);

    // Broadcast de nombres de ciudades
    int names_buf_size = 0;
    if (rank == 0) names_buf_size = static_cast<int>(names_buffer.size());
    MPI_Bcast(&names_buf_size, 1, MPI_INT, 0, MPI_COMM_WORLD);

    if (rank != 0) {
        names_buffer.resize(names_buf_size);
        name_offsets.resize(num_cities + 1);
    }
    MPI_Bcast(names_buffer.data(), names_buf_size, MPI_CHAR, 0, MPI_COMM_WORLD);
    MPI_Bcast(name_offsets.data(), num_cities + 1, MPI_INT, 0, MPI_COMM_WORLD);

    // Reconstruir el grafo en los workers
    if (rank != 0) {
        std::vector<City> cities(num_cities);
        for (int i = 0; i < num_cities; i++) {
            cities[i].id = city_ids[i];
            cities[i].latitude = city_coords[i * 2];
            cities[i].longitude = city_coords[i * 2 + 1];
            // Extraer nombre y país del buffer
            const char* ptr = names_buffer.data() + name_offsets[i];
            cities[i].name = std::string(ptr);
            ptr += cities[i].name.size() + 1;
            cities[i].country = std::string(ptr);
        }
        graph.deserialize(cities, edge_data, edge_weights, edge_offsets);
    }

    // ==========================================================================
    // PASO 3: Distribuir consultas con MPI_Scatter
    // Las consultas se dividen equitativamente entre los procesos.
    // Si no son divisibles exactamente, el master asume las sobrantes.
    // ==========================================================================

    // Calcular cuántas consultas le tocan a cada proceso
    int base_count = total_queries / num_procs;
    int remainder = total_queries % num_procs;

    // Cada proceso recibe base_count consultas; los primeros 'remainder'
    // procesos reciben una extra.
    std::vector<int> send_counts(num_procs);
    std::vector<int> displacements(num_procs);
    for (int i = 0; i < num_procs; i++) {
        send_counts[i] = (base_count + (i < remainder ? 1 : 0)) * 2; // *2 porque cada query tiene 2 ints
        displacements[i] = (i == 0) ? 0 : displacements[i-1] + send_counts[i-1];
    }

    int my_count = send_counts[rank] / 2;  // Número de consultas para este proceso

    // Preparar buffer plano de consultas para Scatter
    std::vector<int> all_queries_flat;
    if (rank == 0) {
        all_queries_flat.resize(total_queries * 2);
        for (int i = 0; i < total_queries; i++) {
            all_queries_flat[i * 2] = all_queries[i].origin;
            all_queries_flat[i * 2 + 1] = all_queries[i].destination;
        }
    }

    // Buffer local para las consultas de este proceso
    std::vector<int> my_queries_flat(my_count * 2);

    MPI_Scatterv(rank == 0 ? all_queries_flat.data() : nullptr,
                 send_counts.data(), displacements.data(), MPI_INT,
                 my_queries_flat.data(), my_count * 2, MPI_INT,
                 0, MPI_COMM_WORLD);

    // Reconstruir las consultas locales
    std::vector<Query> my_queries(my_count);
    for (int i = 0; i < my_count; i++) {
        my_queries[i].origin = my_queries_flat[i * 2];
        my_queries[i].destination = my_queries_flat[i * 2 + 1];
    }

    // ==========================================================================
    // PASO 4: Cada proceso ejecuta Dijkstra para sus consultas asignadas
    // ==========================================================================

    // Sincronizar todos los procesos antes de medir tiempo
    MPI_Barrier(MPI_COMM_WORLD);
    double start_time = MPI_Wtime();

    // Procesar las consultas locales
    std::vector<FlatResult> my_results(my_count);
    // Almacenar las rutas detalladas localmente (para envío posterior)
    std::vector<std::vector<RouteResult>> my_detailed_routes(my_count);

    for (int i = 0; i < my_count; i++) {
        auto routes = find_alternative_routes(graph,
                                               my_queries[i].origin,
                                               my_queries[i].destination,
                                               K_ALTERNATIVES);

        my_results[i].origin = my_queries[i].origin;
        my_results[i].destination = my_queries[i].destination;

        if (!routes.empty()) {
            my_results[i].found = 1;
            my_results[i].best_distance = routes[0].total_distance;
            my_results[i].best_path_length = static_cast<int>(routes[0].path.size());
            my_results[i].num_alternatives = static_cast<int>(routes.size()) - 1;
            my_detailed_routes[i] = routes;
        } else {
            my_results[i].found = 0;
            my_results[i].best_distance = 0.0;
            my_results[i].best_path_length = 0;
            my_results[i].num_alternatives = 0;
        }
    }

    MPI_Barrier(MPI_COMM_WORLD);
    double end_time = MPI_Wtime();
    double elapsed_s = end_time - start_time;
    double elapsed_ms = elapsed_s * 1000.0;

    // ==========================================================================
    // PASO 5: Recopilar resultados con MPI_Gatherv
    // ==========================================================================

    // Preparar conteos para Gatherv (en unidades de FlatResult = 6 doubles/ints)
    // Usamos MPI_BYTE para enviar structs
    int my_result_bytes = my_count * static_cast<int>(sizeof(FlatResult));
    std::vector<int> recv_counts(num_procs);
    std::vector<int> recv_displs(num_procs);

    MPI_Gather(&my_result_bytes, 1, MPI_INT,
               recv_counts.data(), 1, MPI_INT,
               0, MPI_COMM_WORLD);

    std::vector<FlatResult> all_results;
    if (rank == 0) {
        all_results.resize(total_queries);
        recv_displs[0] = 0;
        for (int i = 1; i < num_procs; i++) {
            recv_displs[i] = recv_displs[i-1] + recv_counts[i-1];
        }
    }

    MPI_Gatherv(my_results.data(), my_result_bytes, MPI_BYTE,
                rank == 0 ? all_results.data() : nullptr,
                recv_counts.data(), recv_displs.data(), MPI_BYTE,
                0, MPI_COMM_WORLD);

    // ==========================================================================
    // PASO 6: Enviar rutas detalladas al master (MPI_Send/MPI_Recv punto a punto)
    // Solo se envían las primeras MAX_VERBOSE_QUERIES para mostrar en detalle.
    // ==========================================================================

    // Recopilar rutas detalladas de todos los procesos
    // Estructura: para cada ruta, enviar [num_nodos, nodo0, nodo1, ..., distancia]
    std::vector<std::vector<RouteResult>> all_detailed_routes;

    if (rank == 0) {
        // Las rutas del master ya están en my_detailed_routes
        all_detailed_routes.insert(all_detailed_routes.end(),
                                    my_detailed_routes.begin(),
                                    my_detailed_routes.end());

        // Recibir rutas de cada worker
        for (int src = 1; src < num_procs; src++) {
            int worker_count = send_counts[src] / 2;

            for (int q = 0; q < worker_count; q++) {
                // Recibir número de rutas para esta consulta
                int num_routes = 0;
                MPI_Recv(&num_routes, 1, MPI_INT, src, q * 2, MPI_COMM_WORLD, MPI_STATUS_IGNORE);

                std::vector<RouteResult> query_routes;
                for (int r = 0; r < num_routes; r++) {
                    // Recibir longitud del path
                    int path_len = 0;
                    MPI_Recv(&path_len, 1, MPI_INT, src, q * 2 + 1, MPI_COMM_WORLD, MPI_STATUS_IGNORE);

                    RouteResult rr;
                    rr.path.resize(path_len);
                    MPI_Recv(rr.path.data(), path_len, MPI_INT, src, q * 2, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
                    MPI_Recv(&rr.total_distance, 1, MPI_DOUBLE, src, q * 2 + 1, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
                    rr.found = true;
                    if (!rr.path.empty()) {
                        rr.origin = rr.path.front();
                        rr.destination = rr.path.back();
                    }
                    query_routes.push_back(rr);
                }
                all_detailed_routes.push_back(query_routes);
            }
        }
    } else {
        // Workers envían sus rutas detalladas al master
        for (int q = 0; q < my_count; q++) {
            int num_routes = static_cast<int>(my_detailed_routes[q].size());
            MPI_Send(&num_routes, 1, MPI_INT, 0, q * 2, MPI_COMM_WORLD);

            for (int r = 0; r < num_routes; r++) {
                int path_len = static_cast<int>(my_detailed_routes[q][r].path.size());
                MPI_Send(&path_len, 1, MPI_INT, 0, q * 2 + 1, MPI_COMM_WORLD);
                MPI_Send(my_detailed_routes[q][r].path.data(), path_len, MPI_INT, 0, q * 2, MPI_COMM_WORLD);
                MPI_Send(&my_detailed_routes[q][r].total_distance, 1, MPI_DOUBLE, 0, q * 2 + 1, MPI_COMM_WORLD);
            }
        }
    }

    // ==========================================================================
    // PASO 7: El master muestra los resultados
    // ==========================================================================

    if (rank == 0) {
        std::cout << std::endl;
        std::cout << "Procesamiento completado." << std::endl;
        std::cout << "Consultas por proceso:" << std::endl;
        for (int i = 0; i < num_procs; i++) {
            std::cout << "  Rank " << i << ": " << send_counts[i] / 2 << " consultas" << std::endl;
        }
        std::cout << std::endl;

        // Modo verbose: mostrar detalle de primeras consultas
        if (verbose) {
            int show_count = std::min(total_queries, MAX_VERBOSE_QUERIES);
            std::cout << "============================================================" << std::endl;
            std::cout << "  DETALLE DE PRIMERAS " << show_count << " CONSULTAS" << std::endl;
            std::cout << "============================================================" << std::endl;

            for (int i = 0; i < show_count && i < static_cast<int>(all_detailed_routes.size()); i++) {
                const auto& routes = all_detailed_routes[i];
                if (routes.empty()) {
                    std::cout << std::endl << "--- Consulta " << (i+1) << " ---" << std::endl;
                    std::cout << "  No se encontro ruta." << std::endl;
                    continue;
                }

                std::cout << std::endl << "--- Consulta " << (i+1) << ": "
                          << graph.get_city(routes[0].origin).name << " -> "
                          << graph.get_city(routes[0].destination).name << " ---" << std::endl;
                std::cout << "  Ruta optima:" << std::endl;
                print_route(graph, routes[0]);
                for (size_t j = 1; j < routes.size(); j++) {
                    std::cout << "  Alternativa " << j << ":" << std::endl;
                    print_route(graph, routes[j]);
                }
            }
            std::cout << std::endl;
        }

        // Estadísticas
        int routes_found = 0;
        int routes_not_found = 0;
        double total_distance = 0.0;
        double min_distance = std::numeric_limits<double>::infinity();
        double max_distance = 0.0;
        int total_alternatives = 0;

        for (const auto& r : all_results) {
            if (r.found) {
                routes_found++;
                total_distance += r.best_distance;
                min_distance = std::min(min_distance, r.best_distance);
                max_distance = std::max(max_distance, r.best_distance);
                total_alternatives += r.num_alternatives;
            } else {
                routes_not_found++;
            }
        }

        double avg_distance = (routes_found > 0) ? total_distance / routes_found : 0.0;
        double avg_time_per_query = elapsed_ms / total_queries;

        std::cout << "============================================================" << std::endl;
        std::cout << "  RESULTADOS - VERSION MPI" << std::endl;
        std::cout << "============================================================" << std::endl;
        std::cout << std::fixed << std::setprecision(2);
        std::cout << std::endl;
        std::cout << "  Dataset:                " << dataset << std::endl;
        std::cout << "  Ciudades:               " << graph.num_cities() << std::endl;
        std::cout << "  Conexiones:             " << graph.num_edges() << std::endl;
        std::cout << "  Consultas procesadas:   " << total_queries << std::endl;
        std::cout << "  Procesos MPI:           " << num_procs << std::endl;
        std::cout << "  Rutas encontradas:      " << routes_found << std::endl;
        std::cout << "  Rutas no encontradas:   " << routes_not_found << std::endl;
        std::cout << "  Alternativas totales:   " << total_alternatives << std::endl;
        std::cout << std::endl;
        std::cout << "  Distancia promedio:     " << avg_distance << " km" << std::endl;
        std::cout << "  Distancia minima:       " << min_distance << " km" << std::endl;
        std::cout << "  Distancia maxima:       " << max_distance << " km" << std::endl;
        std::cout << std::endl;
        std::cout << "  --- Tiempos de Ejecucion ---" << std::endl;
        std::cout << "  Modo:                   MPI (" << num_procs << " procesos)" << std::endl;
        std::cout << "  Tiempo total:           " << elapsed_ms << " ms ("
                  << elapsed_s << " s)" << std::endl;
        std::cout << "  Tiempo por consulta:    " << avg_time_per_query << " ms" << std::endl;
        std::cout << std::endl;

        // Línea CSV para benchmark
        std::cout << "  --- Linea CSV para benchmark ---" << std::endl;
        std::cout << "  mpi," << dataset << "," << num_procs << ","
                  << total_queries << "," << std::setprecision(4) << elapsed_ms
                  << "," << routes_found << std::endl;
        std::cout << std::endl;
        std::cout << "============================================================" << std::endl;
    }

    MPI_Finalize();
    return 0;
}
