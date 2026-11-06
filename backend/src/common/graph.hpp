// =============================================================================
// backend/src/common/graph.hpp — copia del módulo ya probado
// =============================================================================
#ifndef GRAPH_HPP
#define GRAPH_HPP

#include <string>
#include <vector>
#include <utility>
#include <iostream>

struct City {
    int id;
    std::string name;
    std::string country;
    double latitude;
    double longitude;
};

class Graph {
public:
    Graph();
    bool load_cities(const std::string& filename);
    bool load_routes(const std::string& filename);
    int num_cities() const;
    int num_edges() const;
    const City& get_city(int id) const;
    const std::vector<std::pair<int, double>>& get_neighbors(int id) const;
    void serialize(std::vector<int>& edge_data, std::vector<double>& edge_weights,
                   std::vector<int>& edge_offsets) const;
    void deserialize(const std::vector<City>& cities,
                     const std::vector<int>& edge_data,
                     const std::vector<double>& edge_weights,
                     const std::vector<int>& edge_offsets);
    void print_summary() const;
private:
    std::vector<City> cities_;
    std::vector<std::vector<std::pair<int, double>>> adj_list_;
    int num_edges_;
};

#endif
