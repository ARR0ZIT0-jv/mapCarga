#!/bin/bash
# =============================================================================
# generate_data.sh
# Genera datasets sintéticos de diferentes tamaños para benchmarking.
# Los grafos generados tienen propiedades realistas:
#   - Grado promedio bajo (3-6 conexiones por nodo)
#   - Pesos proporcionales a distancia (50-800 km)
#   - Grafo conexo (se garantiza con un spanning tree base)
#
# Uso: bash generate_data.sh [small|medium|large]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../data"

generate_dataset() {
    local size_name="$1"
    local num_cities="$2"
    local extra_edges="$3"
    local num_queries="$4"

    local cities_file="${DATA_DIR}/cities_${size_name}.csv"
    local routes_file="${DATA_DIR}/routes_${size_name}.csv"
    local queries_file="${DATA_DIR}/queries_${size_name}.csv"

    echo "Generando dataset '${size_name}': ${num_cities} ciudades, ~${extra_edges} conexiones extra, ${num_queries} consultas..."

    # --- Generar ciudades ---
    echo "id,nombre,pais,latitud,longitud" > "$cities_file"
    for ((i=0; i<num_cities; i++)); do
        # Coordenadas aleatorias en la región del Gran Chaco ampliado
        # Lat: -28 a -17, Lon: -66 a -55
        lat=$(awk "BEGIN{srand($RANDOM+$i); printf \"%.4f\", -28 + rand()*11}")
        lon=$(awk "BEGIN{srand($RANDOM+$i+1000); printf \"%.4f\", -66 + rand()*11}")
        echo "${i},Ciudad_${i},Sintetico,${lat},${lon}" >> "$cities_file"
    done

    # --- Generar rutas ---
    echo "origen_id,destino_id,distancia_km" > "$routes_file"

    # Primero: spanning tree aleatorio para garantizar conexidad
    # Se usa una permutación aleatoria y se conectan nodos consecutivos
    perm=$(shuf -i 0-$((num_cities-1)))
    prev=""
    for node in $perm; do
        if [ -n "$prev" ]; then
            dist=$(awk "BEGIN{srand($RANDOM+$prev+$node); printf \"%d\", 50 + rand()*750}")
            echo "${prev},${node},${dist}" >> "$routes_file"
        fi
        prev=$node
    done

    # Luego: agregar aristas extra aleatorias
    added=0
    attempts=0
    max_attempts=$((extra_edges * 5))
    while [ $added -lt $extra_edges ] && [ $attempts -lt $max_attempts ]; do
        a=$((RANDOM % num_cities))
        b=$((RANDOM % num_cities))
        if [ $a -ne $b ]; then
            dist=$(awk "BEGIN{srand($RANDOM+$a+$b); printf \"%d\", 50 + rand()*750}")
            echo "${a},${b},${dist}" >> "$routes_file"
            added=$((added + 1))
        fi
        attempts=$((attempts + 1))
    done

    # --- Generar consultas ---
    echo "origen_id,destino_id" > "$queries_file"
    for ((i=0; i<num_queries; i++)); do
        a=$((RANDOM % num_cities))
        b=$((RANDOM % num_cities))
        while [ $a -eq $b ]; do
            b=$((RANDOM % num_cities))
        done
        echo "${a},${b}" >> "$queries_file"
    done

    echo "  -> ${cities_file}"
    echo "  -> ${routes_file}"
    echo "  -> ${queries_file}"
    echo "  Dataset '${size_name}' generado."
}

# También generar consultas para el dataset real (small)
generate_queries_real() {
    local queries_file="${DATA_DIR}/queries_small.csv"
    local num_cities=25
    local num_queries=100

    echo "Generando consultas para el dataset real (small)..."
    echo "origen_id,destino_id" > "$queries_file"
    for ((i=0; i<num_queries; i++)); do
        a=$((RANDOM % num_cities))
        b=$((RANDOM % num_cities))
        while [ $a -eq $b ]; do
            b=$((RANDOM % num_cities))
        done
        echo "${a},${b}" >> "$queries_file"
    done
    echo "  -> ${queries_file}"
}

case "${1:-all}" in
    small)
        generate_queries_real
        ;;
    medium)
        generate_dataset "medium" 200 600 1000
        ;;
    large)
        generate_dataset "large" 1000 3000 10000
        ;;
    all)
        generate_queries_real
        generate_dataset "medium" 200 600 1000
        generate_dataset "large" 1000 3000 10000
        echo ""
        echo "=== Todos los datasets generados ==="
        ;;
    *)
        echo "Uso: $0 [small|medium|large|all]"
        exit 1
        ;;
esac
