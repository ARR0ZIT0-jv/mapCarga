// =============================================================================
// graph.cpp
// Implementación de la clase Graph.
// Carga ciudades y rutas desde CSV, construye lista de adyacencia.
// =============================================================================
#include "graph.hpp"
#include <fstream>
#include <sstream>
#include <algorithm>
#include <stdexcept>

Graph::Graph() : num_edges_(0) {}

// -----------------------------------------------------------------------------
// Carga las ciudades desde un archivo CSV.
// Formato esperado: id,nombre,pais,latitud,longitud
// Retorna true si la carga fue exitosa.
// -----------------------------------------------------------------------------
bool Graph::load_cities(const std::string& filename) {
    std::ifstream file(filename);
    if (!file.is_open()) {
        std::cerr << "Error: No se pudo abrir el archivo de ciudades: "
                  << filename << std::endl;
        return false;
    }

    cities_.clear();
    std::string line;

    // Saltar la línea de encabezado
    std::getline(file, line);

    while (std::getline(file, line)) {
        if (line.empty()) continue;

        std::stringstream ss(line);
        std::string token;
        City city;

        // Parsear cada campo separado por coma
        std::getline(ss, token, ',');
        city.id = std::stoi(token);

        std::getline(ss, city.name, ',');
        std::getline(ss, city.country, ',');

        std::getline(ss, token, ',');
        city.latitude = std::stod(token);

        std::getline(ss, token, ',');
        city.longitude = std::stod(token);

        cities_.push_back(city);
    }

    // Inicializar la lista de adyacencia con el número de ciudades
    adj_list_.resize(cities_.size());

    file.close();
    return true;
}

// -----------------------------------------------------------------------------
// Carga las rutas desde un archivo CSV.
// Formato esperado: origen_id,destino_id,distancia_km
// El grafo es no dirigido: cada ruta se agrega en ambas direcciones.
// Retorna true si la carga fue exitosa.
// Requiere que las ciudades ya estén cargadas (load_cities).
// -----------------------------------------------------------------------------
bool Graph::load_routes(const std::string& filename) {
    std::ifstream file(filename);
    if (!file.is_open()) {
        std::cerr << "Error: No se pudo abrir el archivo de rutas: "
                  << filename << std::endl;
        return false;
    }

    if (cities_.empty()) {
        std::cerr << "Error: Debe cargar las ciudades antes de las rutas."
                  << std::endl;
        return false;
    }

    // Limpiar conexiones anteriores
    for (auto& neighbors : adj_list_) {
        neighbors.clear();
    }
    num_edges_ = 0;

    std::string line;

    // Saltar la línea de encabezado
    std::getline(file, line);

    int n = static_cast<int>(cities_.size());

    while (std::getline(file, line)) {
        if (line.empty()) continue;

        std::stringstream ss(line);
        std::string token;

        std::getline(ss, token, ',');
        int origin = std::stoi(token);

        std::getline(ss, token, ',');
        int dest = std::stoi(token);

        std::getline(ss, token, ',');
        double distance = std::stod(token);

        // Validar que los IDs estén dentro del rango
        if (origin < 0 || origin >= n || dest < 0 || dest >= n) {
            std::cerr << "Advertencia: Ruta con IDs fuera de rango ignorada: "
                      << origin << " -> " << dest << std::endl;
            continue;
        }

        // Agregar arista en ambas direcciones (grafo no dirigido)
        adj_list_[origin].emplace_back(dest, distance);
        adj_list_[dest].emplace_back(origin, distance);
        num_edges_++;
    }

    file.close();
    return true;
}

int Graph::num_cities() const {
    return static_cast<int>(cities_.size());
}

int Graph::num_edges() const {
    return num_edges_;
}

const City& Graph::get_city(int id) const {
    if (id < 0 || id >= static_cast<int>(cities_.size())) {
        throw std::out_of_range("ID de ciudad fuera de rango: " + std::to_string(id));
    }
    return cities_[id];
}

const std::vector<std::pair<int, double>>& Graph::get_neighbors(int id) const {
    if (id < 0 || id >= static_cast<int>(adj_list_.size())) {
        throw std::out_of_range("ID de ciudad fuera de rango: " + std::to_string(id));
    }
    return adj_list_[id];
}

// -----------------------------------------------------------------------------
// Serialización: convierte la lista de adyacencia a arrays planos.
// Formato CSR (Compressed Sparse Row):
//   edge_offsets[i] = índice donde comienzan los vecinos del nodo i
//   edge_data[j]    = ID del vecino j
//   edge_weights[j] = peso de la arista j
// Esto permite enviar el grafo eficientemente por MPI.
// -----------------------------------------------------------------------------
void Graph::serialize(std::vector<int>& edge_data, std::vector<double>& edge_weights,
                      std::vector<int>& edge_offsets) const {
    int n = num_cities();
    edge_offsets.resize(n + 1);
    edge_data.clear();
    edge_weights.clear();

    edge_offsets[0] = 0;
    for (int i = 0; i < n; i++) {
        for (const auto& [neighbor, weight] : adj_list_[i]) {
            edge_data.push_back(neighbor);
            edge_weights.push_back(weight);
        }
        edge_offsets[i + 1] = static_cast<int>(edge_data.size());
    }
}

void Graph::deserialize(const std::vector<City>& cities,
                        const std::vector<int>& edge_data,
                        const std::vector<double>& edge_weights,
                        const std::vector<int>& edge_offsets) {
    cities_ = cities;
    int n = static_cast<int>(cities_.size());
    adj_list_.resize(n);
    num_edges_ = 0;

    for (int i = 0; i < n; i++) {
        adj_list_[i].clear();
        for (int j = edge_offsets[i]; j < edge_offsets[i + 1]; j++) {
            adj_list_[i].emplace_back(edge_data[j], edge_weights[j]);
        }
        num_edges_ += static_cast<int>(adj_list_[i].size());
    }
    // Cada arista se cuenta dos veces (grafo no dirigido)
    num_edges_ /= 2;
}

// -----------------------------------------------------------------------------
// Imprime un resumen del grafo: número de ciudades, aristas y lista de ciudades.
// -----------------------------------------------------------------------------
void Graph::print_summary() const {
    std::cout << "=== Resumen del Grafo ===" << std::endl;
    std::cout << "Ciudades: " << num_cities() << std::endl;
    std::cout << "Conexiones: " << num_edges_ << std::endl;
    std::cout << std::endl;

    for (const auto& city : cities_) {
        std::cout << "  [" << city.id << "] " << city.name
                  << " (" << city.country << ") - "
                  << adj_list_[city.id].size() << " conexiones" << std::endl;
    }
    std::cout << std::endl;
}
