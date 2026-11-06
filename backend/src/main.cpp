// =============================================================================
// backend/src/main.cpp
// Punto de entrada del servidor REST.
// Inicializa el grafo, registra los endpoints y arranca el servidor HTTP.
// =============================================================================
#include "api/router.hpp"
#include "common/graph.hpp"
#include <iostream>
#include <string>
#include <csignal>

// Puerto del servidor (puede sobreescribirse con variable de entorno PORT)
static const int DEFAULT_PORT = 8080;
// Ruta base a los datos (relativa al directorio de ejecución)
static const std::string DATA_DIR = "./data";

// Instancia global del servidor para manejo de señales
static httplib::Server* g_server_ptr = nullptr;

// Manejador de señal para cierre limpio (Ctrl+C)
void signal_handler(int signal) {
    std::cout << "\n[Servidor] Deteniendo servidor..." << std::endl;
    if (g_server_ptr) {
        g_server_ptr->stop();
    }
}

int main(int argc, char* argv[]) {
    std::cout << "============================================================" << std::endl;
    std::cout << "  OPTIMIZADOR DE RUTAS DEL GRAN CHACO — SERVIDOR REST" << std::endl;
    std::cout << "============================================================" << std::endl;

    // Determinar puerto
    int port = DEFAULT_PORT;
    const char* port_env = std::getenv("PORT");
    if (port_env) port = std::stoi(port_env);

    // Determinar directorio de datos
    std::string data_dir = DATA_DIR;
    if (argc > 1) data_dir = argv[1];

    // -------------------------------------------------------------------------
    // Cargar el grafo desde los archivos CSV
    // -------------------------------------------------------------------------
    std::cout << "[Init] Cargando datos desde: " << data_dir << std::endl;

    Graph graph;
    if (!graph.load_cities(data_dir + "/cities.csv")) {
        std::cerr << "[Error] No se pudo cargar cities.csv" << std::endl;
        std::cerr << "        Ejecutar desde la raíz del proyecto:" << std::endl;
        std::cerr << "        ./backend/bin/servidor" << std::endl;
        return 1;
    }
    if (!graph.load_routes(data_dir + "/routes.csv")) {
        std::cerr << "[Error] No se pudo cargar routes.csv" << std::endl;
        return 1;
    }

    std::cout << "[Init] Grafo cargado: "
              << graph.num_cities() << " ciudades, "
              << graph.num_edges() << " conexiones" << std::endl;

    // -------------------------------------------------------------------------
    // Inicializar servidor HTTP
    // -------------------------------------------------------------------------
    httplib::Server server;
    g_server_ptr = &server;

    // Registrar manejador de señal para Ctrl+C
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    // Registrar todos los endpoints de la API
    register_routes(server, graph);

    // -------------------------------------------------------------------------
    // Arrancar servidor
    // -------------------------------------------------------------------------
    std::cout << std::endl;
    std::cout << "[Servidor] Escuchando en http://localhost:" << port << std::endl;
    std::cout << "[Servidor] Frontend en   http://localhost:" << port << "/" << std::endl;
    std::cout << "[Servidor] API en        http://localhost:" << port << "/api/" << std::endl;
    std::cout << "[Servidor] Presiona Ctrl+C para detener." << std::endl;
    std::cout << "============================================================" << std::endl;

    if (!server.listen("0.0.0.0", port)) {
        std::cerr << "[Error] No se pudo iniciar el servidor en el puerto "
                  << port << std::endl;
        std::cerr << "        Verifica que el puerto no esté en uso:" << std::endl;
        std::cerr << "        lsof -i :" << port << std::endl;
        return 1;
    }

    std::cout << "[Servidor] Servidor detenido correctamente." << std::endl;
    return 0;
}
