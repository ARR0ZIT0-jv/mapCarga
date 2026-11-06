// =============================================================================
// backend/src/api/router.cpp
// Implementación de los endpoints REST.
//
// Endpoints disponibles:
//   GET  /api/cities          → Lista todas las ciudades
//   GET  /api/routes          → Lista todas las conexiones
//   POST /api/route/shortest  → Calcula la ruta más corta con alternativas
//   GET  /api/stats           → Estadísticas del servidor
// =============================================================================
#include "router.hpp"
#include <sstream>
#include <iomanip>
#include <chrono>
#include <iostream>

// Contadores globales
std::atomic<int> g_query_count{0};
double g_total_time_ms = 0.0;

// -----------------------------------------------------------------------------
// Agrega cabeceras CORS a la respuesta.
// Necesario para que el navegador permita peticiones desde el frontend
// (que corre en un origen distinto al backend).
// -----------------------------------------------------------------------------
void add_cors_headers(httplib::Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set_header("Access-Control-Allow-Headers",
                   "Content-Type, Authorization");
}

// -----------------------------------------------------------------------------
// Serializa una ciudad al formato JSON.
// -----------------------------------------------------------------------------
std::string city_to_json(const City& city) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(6);
    oss << "{"
        << "\"id\":" << city.id << ","
        << "\"name\":\"" << city.name << "\","
        << "\"country\":\"" << city.country << "\","
        << "\"lat\":" << city.latitude << ","
        << "\"lon\":" << city.longitude
        << "}";
    return oss.str();
}

// -----------------------------------------------------------------------------
// Serializa el resultado de una búsqueda de ruta a JSON.
// Incluye la ruta óptima y las alternativas.
// -----------------------------------------------------------------------------
std::string route_result_to_json(const Graph& graph,
                                  const std::vector<RouteResult>& routes,
                                  double exec_time_ms) {
    if (routes.empty() || !routes[0].found) {
        return "{\"found\":false,\"message\":\"No se encontro una ruta entre las ciudades seleccionadas.\"}";
    }

    const RouteResult& best = routes[0];
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2);

    // Ruta principal
    oss << "{"
        << "\"found\":true,"
        << "\"origin_id\":" << best.origin << ","
        << "\"destination_id\":" << best.destination << ","
        << "\"total_distance\":" << best.total_distance << ","
        << "\"execution_time_ms\":" << exec_time_ms << ",";

    // Path como array de IDs
    oss << "\"path\":[";
    for (size_t i = 0; i < best.path.size(); i++) {
        oss << best.path[i];
        if (i + 1 < best.path.size()) oss << ",";
    }
    oss << "],";

    // Path como array de nombres de ciudades
    oss << "\"path_names\":[";
    for (size_t i = 0; i < best.path.size(); i++) {
        oss << "\"" << graph.get_city(best.path[i]).name << "\"";
        if (i + 1 < best.path.size()) oss << ",";
    }
    oss << "],";

    // Path como array de coordenadas [lat, lon]
    oss << "\"path_coords\":[";
    for (size_t i = 0; i < best.path.size(); i++) {
        const City& c = graph.get_city(best.path[i]);
        oss << std::setprecision(6) << "[" << c.latitude << "," << c.longitude << "]";
        if (i + 1 < best.path.size()) oss << ",";
    }
    oss << "],";

    // Rutas alternativas
    oss << "\"alternatives\":[";
    for (size_t a = 1; a < routes.size(); a++) {
        const RouteResult& alt = routes[a];
        if (!alt.found) continue;
        if (a > 1) oss << ",";

        oss << std::setprecision(2);
        oss << "{"
            << "\"total_distance\":" << alt.total_distance << ","
            << "\"path_names\":[";
        for (size_t i = 0; i < alt.path.size(); i++) {
            oss << "\"" << graph.get_city(alt.path[i]).name << "\"";
            if (i + 1 < alt.path.size()) oss << ",";
        }
        oss << "],"
            << "\"path_coords\":[";
        for (size_t i = 0; i < alt.path.size(); i++) {
            const City& c = graph.get_city(alt.path[i]);
            oss << std::setprecision(6) << "[" << c.latitude << "," << c.longitude << "]";
            if (i + 1 < alt.path.size()) oss << ",";
        }
        oss << "]}";
    }
    oss << "]"
        << "}";

    return oss.str();
}

// -----------------------------------------------------------------------------
// Extrae un valor entero de un cuerpo JSON simple.
// Busca el patrón "clave":valor y retorna el valor como int.
// No usa una librería JSON completa para mantener las dependencias mínimas.
// -----------------------------------------------------------------------------
static bool extract_int(const std::string& json, const std::string& key, int& value) {
    std::string search = "\"" + key + "\":";
    auto pos = json.find(search);
    if (pos == std::string::npos) return false;
    pos += search.size();
    // Saltar espacios
    while (pos < json.size() && json[pos] == ' ') pos++;
    // Leer el número
    std::string num_str;
    while (pos < json.size() && (std::isdigit(json[pos]) || json[pos] == '-')) {
        num_str += json[pos++];
    }
    if (num_str.empty()) return false;
    value = std::stoi(num_str);
    return true;
}

// -----------------------------------------------------------------------------
// Registra todos los endpoints en el servidor HTTP.
// El grafo se pasa por referencia const (es de solo lectura).
// -----------------------------------------------------------------------------
void register_routes(httplib::Server& server, const Graph& graph) {

    // -------------------------------------------------------------------------
    // OPTIONS /* — Preflight CORS
    // El navegador envía este request antes de cualquier POST cross-origin.
    // -------------------------------------------------------------------------
    server.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        add_cors_headers(res);
        res.status = 204;
    });

    // -------------------------------------------------------------------------
    // GET /api/cities
    // Retorna todas las ciudades en formato JSON.
    // Ejemplo de respuesta:
    //   {"cities": [{id:0, nombre:"Yacuiba", pais:"Bolivia", lat:-21.96, lon:-63.68}, ...]}
    // -------------------------------------------------------------------------
    server.Get("/api/cities", [&graph](const httplib::Request&,
                                       httplib::Response& res) {
        add_cors_headers(res);
        std::ostringstream oss;
        oss << "[";
        for (int i = 0; i < graph.num_cities(); i++) {
            if (i > 0) oss << ",";
            oss << city_to_json(graph.get_city(i));
        }
        oss << "]";
        res.set_content(oss.str(), "application/json");
    });

    // -------------------------------------------------------------------------
    // GET /api/routes
    // Retorna todas las conexiones entre ciudades.
    // Ejemplo de respuesta:
    //   {"routes": [{origin_id:0, destination_id:1, distance_km:100}, ...]}
    // -------------------------------------------------------------------------
    server.Get("/api/routes", [&graph](const httplib::Request&,
                                        httplib::Response& res) {
        add_cors_headers(res);
        std::ostringstream oss;
        oss << std::fixed << std::setprecision(1);
        oss << "[";

        bool first = true;
        for (int u = 0; u < graph.num_cities(); u++) {
            for (const auto& [v, w] : graph.get_neighbors(u)) {
                if (u < v) {  // Evitar duplicados
                    if (!first) oss << ",";
                    oss << "{\"from_id\":" << u
                        << ",\"to_id\":" << v
                        << ",\"distance_km\":" << w << "}";
                    first = false;
                }
            }
        }
        oss << "]";
        res.set_content(oss.str(), "application/json");
    });

    // -------------------------------------------------------------------------
    // POST /api/route/shortest
    // Calcula la ruta más corta entre dos ciudades usando Dijkstra.
    //
    // Body JSON esperado:
    //   {"origin_id": 0, "destination_id": 12}
    //
    // Respuesta:
    //   {found, origin_id, destination_id, total_distance,
    //    execution_time_ms, path, path_names, path_coords, alternatives}
    // -------------------------------------------------------------------------
    server.Post("/api/route/shortest", [&graph](const httplib::Request& req,
                                                 httplib::Response& res) {
        add_cors_headers(res);

        int origin_id = -1, destination_id = -1;

        if (!extract_int(req.body, "origin_id", origin_id) ||
            !extract_int(req.body, "destination_id", destination_id)) {
            res.status = 400;
            res.set_content("{\"error\":\"Se requieren origin_id y destination_id\"}",
                           "application/json");
            return;
        }

        // Validar rango
        if (origin_id < 0 || origin_id >= graph.num_cities() ||
            destination_id < 0 || destination_id >= graph.num_cities()) {
            res.status = 400;
            res.set_content("{\"error\":\"IDs de ciudad fuera de rango\"}",
                           "application/json");
            return;
        }

        // Registrar inicio de tiempo
        auto t_start = std::chrono::high_resolution_clock::now();

        // Ejecutar Dijkstra + rutas alternativas
        auto routes = find_alternative_routes(graph, origin_id, destination_id, 3);

        auto t_end = std::chrono::high_resolution_clock::now();
        double exec_ms = std::chrono::duration<double, std::milli>(
            t_end - t_start).count();

        // Actualizar estadísticas globales
        g_query_count++;
        g_total_time_ms += exec_ms;

        std::string json = route_result_to_json(graph, routes, exec_ms);
        res.set_content(json, "application/json");

        std::cout << "[API] Ruta calculada: "
                  << graph.get_city(origin_id).name << " -> "
                  << graph.get_city(destination_id).name
                  << " | " << exec_ms << " ms" << std::endl;
    });

    // -------------------------------------------------------------------------
    // GET /api/stats
    // Estadísticas del servidor: ciudades, rutas, consultas, tiempo promedio.
    // -------------------------------------------------------------------------
    server.Get("/api/stats", [&graph](const httplib::Request&,
                                      httplib::Response& res) {
        add_cors_headers(res);
        int qc = g_query_count.load();
        double avg_ms = (qc > 0) ? (g_total_time_ms / qc) : 0.0;

        std::ostringstream oss;
        oss << std::fixed << std::setprecision(3);
        oss << "{"
            << "\"cities_count\":" << graph.num_cities() << ","
            << "\"routes_count\":" << graph.num_edges() << ","
            << "\"total_queries\":" << qc << ","
            << "\"queries_count\":" << qc << ","
            << "\"avg_time_ms\":" << avg_ms
            << "}";
        res.set_content(oss.str(), "application/json");
    });

    // -------------------------------------------------------------------------
    // GET / — Sirve el frontend estático (index.html)
    // -------------------------------------------------------------------------
    server.set_base_dir("./frontend");

    std::cout << "[API] Endpoints registrados:" << std::endl;
    std::cout << "  GET  /api/cities" << std::endl;
    std::cout << "  GET  /api/routes" << std::endl;
    std::cout << "  POST /api/route/shortest" << std::endl;
    std::cout << "  GET  /api/stats" << std::endl;
    std::cout << "  GET  / (frontend estatico)" << std::endl;
}
