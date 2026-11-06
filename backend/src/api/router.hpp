// =============================================================================
// backend/src/api/router.hpp
// Define y registra todos los endpoints REST de la API.
// =============================================================================
#ifndef ROUTER_HPP
#define ROUTER_HPP

#include "../../include/httplib.h"
#include "../common/graph.hpp"
#include "../common/route.hpp"
#include <string>
#include <atomic>

// Contador global de consultas realizadas
extern std::atomic<int> g_query_count;
extern double g_total_time_ms;

// Registra todas las rutas de la API en el servidor HTTP
void register_routes(httplib::Server& server, const Graph& graph);

// Genera cabeceras CORS para permitir peticiones desde el frontend
void add_cors_headers(httplib::Response& res);

// Serializa una ciudad a JSON
std::string city_to_json(const City& city);

// Serializa un resultado de ruta a JSON
std::string route_result_to_json(const Graph& graph,
                                  const RouteResult& result);

#endif // ROUTER_HPP
