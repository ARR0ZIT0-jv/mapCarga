#!/bin/bash
# build.sh — Script de compilación del backend C++
# TEL420 – Sistemas Paralelos
# Proyecto: Optimizador de Rutas de Transporte - Gran Chaco
#
# IMPORTANTE: Ejecutar desde la raíz del proyecto:
#   bash backend/build.sh

set -e  # Salir ante cualquier error

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
OUTPUT_DIR="$BACKEND_DIR/bin"

echo "================================================"
echo "  Compilando backend C++ – Optimizador de Rutas"
echo "================================================"
echo "Directorio del proyecto: $PROJECT_ROOT"
echo "Compilador: $(g++ --version | head -1)"

mkdir -p "$OUTPUT_DIR"

g++ -std=c++17 -O2 -Wall -Wextra \
    -I"$BACKEND_DIR/include" \
    "$BACKEND_DIR/src/main.cpp" \
    "$BACKEND_DIR/src/api/router.cpp" \
    "$BACKEND_DIR/src/common/graph.cpp" \
    "$BACKEND_DIR/src/common/route.cpp" \
    -pthread \
    -o "$OUTPUT_DIR/servidor"

echo ""
echo "✅ Compilación exitosa!"
echo "   Ejecutable: $OUTPUT_DIR/servidor"
echo ""
echo "Para iniciar el servidor:"
echo "   cd $PROJECT_ROOT"
echo "   ./backend/bin/servidor"
echo ""
echo "El servidor estará disponible en: http://localhost:8080"
echo "================================================"
