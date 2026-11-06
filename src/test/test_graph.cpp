// =============================================================================
// test_graph.cpp
// Programa de prueba para verificar la carga del grafo y Dijkstra.
// Se ejecuta con datos reales y comprueba rutas conocidas.
// =============================================================================
#include "../common/graph.hpp"
#include "../common/route.hpp"
#include <iostream>
#include <cassert>
#include <cmath>

// Verifica que dos distancias sean iguales (con tolerancia numérica)
bool approx_equal(double a, double b, double epsilon = 0.1) {
    return std::fabs(a - b) < epsilon;
}

int main() {
    std::cout << "=== Prueba del Grafo y Dijkstra ===" << std::endl;
    std::cout << std::endl;

    // --- Paso 1: Cargar el grafo ---
    Graph graph;

    std::cout << "[1] Cargando ciudades..." << std::endl;
    bool ok = graph.load_cities("data/cities.csv");
    assert(ok && "Fallo al cargar cities.csv");
    std::cout << "    OK: " << graph.num_cities() << " ciudades cargadas" << std::endl;

    std::cout << "[2] Cargando rutas..." << std::endl;
    ok = graph.load_routes("data/routes.csv");
    assert(ok && "Fallo al cargar routes.csv");
    std::cout << "    OK: " << graph.num_edges() << " conexiones cargadas" << std::endl;
    std::cout << std::endl;

    graph.print_summary();

    // --- Paso 2: Verificar Dijkstra con rutas conocidas ---
    std::cout << "=== Pruebas de Dijkstra ===" << std::endl;
    std::cout << std::endl;

    // Test 1: Yacuiba -> Salvador Mazza (directa, 8 km)
    {
        std::cout << "[Test 1] Yacuiba -> Salvador Mazza (ruta directa)" << std::endl;
        RouteResult r = dijkstra(graph, 0, 8);
        assert(r.found);
        assert(approx_equal(r.total_distance, 8.0));
        assert(r.path.size() == 2);
        print_route(graph, r);
        std::cout << "    PASS" << std::endl << std::endl;
    }

    // Test 2: Yacuiba -> Tarija (via Villamontes y Entre Ríos: 100+110+100 = 310 km)
    {
        std::cout << "[Test 2] Yacuiba -> Tarija" << std::endl;
        RouteResult r = dijkstra(graph, 0, 2);
        assert(r.found);
        assert(approx_equal(r.total_distance, 310.0));
        print_route(graph, r);
        std::cout << "    PASS" << std::endl << std::endl;
    }

    // Test 3: Yacuiba -> Salta (via Salvador Mazza-Tartagal-Embarcación-Orán-Salta)
    // 8 + 55 + 100 + 30 + 280 = 473 km
    {
        std::cout << "[Test 3] Yacuiba -> Salta" << std::endl;
        RouteResult r = dijkstra(graph, 0, 12);
        assert(r.found);
        assert(approx_equal(r.total_distance, 473.0));
        print_route(graph, r);
        std::cout << "    PASS" << std::endl << std::endl;
    }

    // Test 4: Yacuiba -> Asunción
    // Ruta Paraguay: 0->1(100) ->20(400) ->19(90) ->21(200) ->22(250) ->18(30) = 1070
    // Ruta Argentina: 0->8(8) ->9(55) ->10(100) ->16(300) ->17(200) ->15(300) ->18(200) = 1163
    // La más corta es la de Paraguay: 1070 km
    {
        std::cout << "[Test 4] Yacuiba -> Asuncion (ruta optima)" << std::endl;
        RouteResult r = dijkstra(graph, 0, 18);
        assert(r.found);
        assert(approx_equal(r.total_distance, 1070.0));
        print_route(graph, r);
        std::cout << "    PASS" << std::endl << std::endl;
    }

    // Test 5: Caso trivial - origen igual a destino
    {
        std::cout << "[Test 5] Yacuiba -> Yacuiba (mismo nodo)" << std::endl;
        RouteResult r = dijkstra(graph, 0, 0);
        assert(r.found);
        assert(approx_equal(r.total_distance, 0.0));
        assert(r.path.size() == 1);
        std::cout << "    Distancia: 0.0 km" << std::endl;
        std::cout << "    PASS" << std::endl << std::endl;
    }

    // --- Paso 3: Verificar rutas alternativas ---
    std::cout << "=== Rutas Alternativas ===" << std::endl;
    std::cout << std::endl;

    {
        std::cout << "[Test 6] Yacuiba -> Asuncion (hasta 3 alternativas)" << std::endl;
        auto routes = find_alternative_routes(graph, 0, 18, 3);
        std::cout << "  Rutas encontradas: " << routes.size() << std::endl;

        for (size_t i = 0; i < routes.size(); i++) {
            std::cout << std::endl << "  --- Ruta " << (i + 1) << " ---" << std::endl;
            print_route(graph, routes[i]);
        }
        assert(routes.size() >= 2); // Al menos la óptima y una alternativa
        assert(approx_equal(routes[0].total_distance, 1070.0)); // La primera es la óptima
        std::cout << "    PASS" << std::endl << std::endl;
    }

    // --- Paso 4: Verificar carga de consultas ---
    std::cout << "=== Carga de Consultas ===" << std::endl;
    {
        auto queries = load_queries("data/queries_small.csv");
        std::cout << "  Consultas cargadas: " << queries.size() << std::endl;
        assert(queries.size() == 100);
        std::cout << "  Primeras 5 consultas:" << std::endl;
        for (int i = 0; i < 5 && i < static_cast<int>(queries.size()); i++) {
            std::cout << "    " << graph.get_city(queries[i].origin).name
                      << " -> " << graph.get_city(queries[i].destination).name
                      << std::endl;
        }
        std::cout << "    PASS" << std::endl << std::endl;
    }

    std::cout << "==========================================" << std::endl;
    std::cout << "  TODAS LAS PRUEBAS PASARON EXITOSAMENTE" << std::endl;
    std::cout << "==========================================" << std::endl;

    return 0;
}
