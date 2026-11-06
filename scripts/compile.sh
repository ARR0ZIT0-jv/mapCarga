#!/bin/bash
# =============================================================================
# compile.sh
# Compila las tres versiones del sistema de optimización de rutas.
# Uso: bash compile.sh [sequential|openmp|mpi|all|test]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
SRC_DIR="${PROJECT_DIR}/src"
BIN_DIR="${PROJECT_DIR}/bin"

# Crear directorio de binarios
mkdir -p "$BIN_DIR"

# Archivos comunes
COMMON_SRC="${SRC_DIR}/common/graph.cpp ${SRC_DIR}/common/route.cpp"

# Flags de compilación
CXX="g++"
CXXFLAGS="-std=c++17 -O2 -Wall -Wextra"

compile_sequential() {
    echo "[Compilando] Version secuencial..."
    $CXX $CXXFLAGS -o "${BIN_DIR}/sequential" \
        "${SRC_DIR}/sequential/main.cpp" $COMMON_SRC
    echo "  -> ${BIN_DIR}/sequential"
}

compile_openmp() {
    echo "[Compilando] Version OpenMP..."
    $CXX $CXXFLAGS -fopenmp -o "${BIN_DIR}/openmp" \
        "${SRC_DIR}/openmp/main.cpp" $COMMON_SRC
    echo "  -> ${BIN_DIR}/openmp"
}

compile_mpi() {
    echo "[Compilando] Version MPI..."
    mpicxx $CXXFLAGS -o "${BIN_DIR}/mpi_solver" \
        "${SRC_DIR}/mpi/main.cpp" $COMMON_SRC
    echo "  -> ${BIN_DIR}/mpi_solver"
}

compile_test() {
    echo "[Compilando] Tests..."
    $CXX $CXXFLAGS -o "${BIN_DIR}/test_graph" \
        "${SRC_DIR}/test/test_graph.cpp" $COMMON_SRC
    echo "  -> ${BIN_DIR}/test_graph"
}

case "${1:-all}" in
    sequential|seq)
        compile_sequential
        ;;
    openmp|omp)
        compile_openmp
        ;;
    mpi)
        compile_mpi
        ;;
    test)
        compile_test
        ;;
    all)
        compile_sequential
        compile_openmp 2>/dev/null || echo "  (OpenMP no disponible, se omite)"
        compile_mpi 2>/dev/null || echo "  (MPI no disponible, se omite)"
        compile_test
        ;;
    *)
        echo "Uso: $0 [sequential|openmp|mpi|test|all]"
        exit 1
        ;;
esac

echo ""
echo "Compilacion completada."
