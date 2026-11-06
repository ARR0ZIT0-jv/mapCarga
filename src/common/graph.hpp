// =============================================================================
// graph.hpp
// Representación de la red de transporte como grafo ponderado no dirigido.
// Usa lista de adyacencia para eficiencia en grafos dispersos.
// =============================================================================
#ifndef GRAPH_HPP
#define GRAPH_HPP

#include <string>
#include <vector>
#include <utility>
#include <iostream>

// Estructura que representa una ciudad en la red de transporte
struct City {
    int id;
    std::string name;
    std::string country;
    double latitude;
    double longitude;
};

// Grafo ponderado no dirigido implementado con lista de adyacencia
class Graph {
public:
    Graph();

    // Carga de datos desde archivos CSV
    bool load_cities(const std::string& filename);
    bool load_routes(const std::string& filename);

    // Acceso a datos del grafo
    int num_cities() const;
    int num_edges() const;
    const City& get_city(int id) const;
    const std::vector<std::pair<int, double>>& get_neighbors(int id) const;

    // Serialización para MPI (conversión a arrays planos)
    // Empaqueta el grafo en vectores planos para enviar con MPI
    void serialize(std::vector<int>& edge_data, std::vector<double>& edge_weights,
                   std::vector<int>& edge_offsets) const;
    // Reconstruye el grafo desde vectores planos recibidos por MPI
    void deserialize(const std::vector<City>& cities,
                     const std::vector<int>& edge_data,
                     const std::vector<double>& edge_weights,
                     const std::vector<int>& edge_offsets);

    // Información de depuración
    void print_summary() const;

private:
    std::vector<City> cities_;
    std::vector<std::vector<std::pair<int, double>>> adj_list_;
    int num_edges_;
};

#endif // GRAPH_HPP
