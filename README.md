# Optimización de Rutas de Transporte — Computación Paralela y Distribuida

> **Proyecto Final Integrador — TEL420 Sistemas Paralelos**
>
> *Diseño e implementación de un sistema de optimización de rutas de transporte de mercancías mediante computación paralela y distribuida en la región del Gran Chaco.*

---

## Descripción

Sistema que calcula rutas óptimas entre ciudades de Bolivia, Argentina y Paraguay
usando el algoritmo de Dijkstra. Las mismas consultas se ejecutan en tres modos:
**secuencial**, **OpenMP** (memoria compartida) y **OpenMPI** (memoria distribuida),
permitiendo comparar rendimiento real entre los tres enfoques.

---

## Tecnologías

| Componente | Tecnología |
|---|---|
| Lenguaje | C++17 |
| Interfaz Web | HTML5, CSS3, JavaScript (Vanilla), Leaflet, OpenStreetMap |
| Backend API REST | C++17 (`cpp-httplib`), multi-hilo |
| Paralelismo compartido | OpenMP |
| Paralelismo distribuido | OpenMPI |
| Infraestructura | Docker + Docker Compose |
| Sistema operativo | Ubuntu 22.04 / Linux |
| Datos | Archivos CSV |

---

## Estructura del Repositorio

```
proyecto-transporte-paralelo/
├── README.md
├── infrastructure/
│   ├── Dockerfile            # Imagen única para los 3 nodos
│   ├── docker-compose.yml    # Clúster master + worker1 + worker2
│   └── entrypoint.sh         # Inicio SSH + contenedor
├── src/
│   ├── common/
│   │   ├── graph.hpp/cpp     # Clase Graph (lista de adyacencia, serialización MPI)
│   │   ├── route.hpp/cpp     # Dijkstra + rutas alternativas (Yen simplificado)
│   ├── sequential/
│   │   └── main.cpp          # Versión secuencial (baseline)
│   ├── openmp/
│   │   └── main.cpp          # Versión paralela OpenMP
│   ├── mpi/
│   │   └── main.cpp          # Versión distribuida MPI
│   └── test/
│       └── test_graph.cpp    # Tests de verificación
├── data/
│   ├── cities.csv            # 25 ciudades reales (Gran Chaco)
│   ├── routes.csv            # 29 conexiones viales
│   ├── queries_small.csv     # 100 consultas
│   ├── cities_medium.csv     # 200 ciudades sintéticas
│   ├── routes_medium.csv     # 799 conexiones
│   ├── queries_medium.csv    # 1 000 consultas
│   ├── cities_large.csv      # 1 000 ciudades sintéticas
│   ├── routes_large.csv      # 3 999 conexiones
│   └── queries_large.csv     # 10 000 consultas
├── scripts/
│   ├── generate_data.sh      # Genera datasets sintéticos
│   ├── compile.sh            # Compila las tres versiones
│   ├── benchmark.sh          # Ejecuta el benchmark completo
│   └── generate_graphs.py    # Genera tablas y gráficas
├── results/
│   ├── tables/               # CSV con tiempos medidos
│   └── graphs/               # Gráficas comparativas
├── frontend/                 # Aplicación Web (HTML5, Leaflet, OSM)
├── backend/                  # Servidor REST API en C++
└── docs/
    └── informe.pdf           # Informe técnico IEEE
```

---

## Aplicación Web (Fase 1)

El proyecto incluye una aplicación web completa e interactiva para calcular y visualizar rutas logísticas en el mapa del Gran Chaco, conectada a un backend en C++ mediante API REST.

### 1. Compilar el Backend Web

```bash
bash backend/build.sh
```

### 2. Iniciar el Servidor

```bash
./backend/bin/servidor
```

### 3. Acceder en el Navegador

Abre tu navegador en:
```
http://localhost:8080/
```

- **Dashboard:** Métricas globales, ciudades conectadas, carreteras registradas e historial de consultas.
- **Mapa y Rutas:** Mapa Leaflet interactivo con ciudades, trazado de carreteras y cálculo de rutas con Dijkstra.
- **Comparación de Rutas:** Tabla detallada de la ruta óptima frente a alternativas.
- **Benchmarking:** Vista de planificación para la integración en Fase 2 de OpenMP y MPI.

---

## Inicio Rápido (con Docker)

### 1. Requisitos previos

```bash
# Verificar Docker y Docker Compose
docker --version        # >= 20.x
docker compose version  # >= 2.x
```

### 2. Construir las imágenes

```bash
# Desde la raíz del proyecto
cd infrastructure
docker compose build
```

> Este paso instala Ubuntu 22.04, OpenMPI, OpenSSH y compila
> automáticamente las tres versiones del programa.

### 3. Levantar el clúster (3 nodos)

```bash
docker compose up -d

# Verificar que los 3 nodos están activos
docker compose ps
```

### 4. Ejecutar las versiones

```bash
# --- Versión Secuencial ---
docker compose exec master /app/bin/sequential small --verbose
docker compose exec master /app/bin/sequential medium
docker compose exec master /app/bin/sequential large

# --- Versión OpenMP ---
# Uso: ./openmp <dataset> <num_hilos> [--verbose]
docker compose exec master /app/bin/openmp small 4 --verbose
docker compose exec master /app/bin/openmp large 2
docker compose exec master /app/bin/openmp large 4
docker compose exec master /app/bin/openmp large 8

# --- Versión MPI ---
# 1 proceso (solo master)
docker compose exec master \
    mpirun --allow-run-as-root -np 1 /app/bin/mpi_solver small

# 3 procesos (master + 2 workers)
docker compose exec master \
    mpirun --hostfile /app/hostfile --allow-run-as-root \
    -np 3 /app/bin/mpi_solver large --verbose
```

### 5. Benchmark completo

```bash
# Copia el script actualizado y ejecuta
docker cp scripts/benchmark.sh master:/app/scripts/benchmark.sh
docker compose exec master bash /app/scripts/benchmark.sh

# Los resultados quedan en /app/results/tables/
docker cp master:/app/results/tables/benchmark_results.csv results/tables/
docker cp master:/app/results/tables/benchmark_summary.csv results/tables/
```

### 6. Generar análisis y gráficas

```bash
python3 scripts/generate_graphs.py

# Si matplotlib está instalado, genera PNGs en results/graphs/
# Si no, genera el análisis en texto: results/tables/analysis.txt
```

### 7. Detener el clúster

```bash
docker compose down
```

---

## Inicio Rápido (sin Docker — solo Secuencial y OpenMP)

```bash
# Compilar
bash scripts/compile.sh sequential
bash scripts/compile.sh openmp

# Ejecutar (desde la raíz del proyecto)
./bin/sequential small --verbose
./bin/openmp large 4

# Regenerar datasets sintéticos
bash scripts/generate_data.sh all

# Benchmark local (sin MPI)
bash scripts/benchmark.sh --local
```

---

## Compilación Manual

```bash
# Secuencial
g++ -std=c++17 -O2 -Wall -o bin/sequential \
    src/sequential/main.cpp src/common/graph.cpp src/common/route.cpp

# OpenMP
g++ -std=c++17 -O2 -Wall -fopenmp -o bin/openmp \
    src/openmp/main.cpp src/common/graph.cpp src/common/route.cpp

# MPI (requiere OpenMPI instalado)
mpicxx -std=c++17 -O2 -Wall -o bin/mpi_solver \
    src/mpi/main.cpp src/common/graph.cpp src/common/route.cpp

# Tests de verificación
g++ -std=c++17 -O2 -Wall -o bin/test_graph \
    src/test/test_graph.cpp src/common/graph.cpp src/common/route.cpp
./bin/test_graph
```

---

## Algoritmos

### Dijkstra (camino mínimo)

- **Complejidad:** O((V + E) log V) con cola de prioridad (min-heap).
- **Justificación:** Pesos positivos (distancias en km) → Dijkstra es óptimo. No se necesita Bellman-Ford ni A*.
- **Implementación:** `std::priority_queue` con pares (distancia, nodo).

### Rutas alternativas (Yen simplificado)

1. Calcular la ruta óptima con Dijkstra.
2. Para cada arista de la ruta óptima, bloquearla y recalcular.
3. Retornar hasta K=3 rutas distintas, ordenadas por distancia.

### Paralelización OpenMP

```cpp
// Cada consulta es independiente → paralelismo trivial sin condiciones de carrera
#pragma omp parallel for schedule(dynamic)
for (int i = 0; i < total_queries; i++) {
    results[i] = find_alternative_routes(graph, queries[i].origin,
                                          queries[i].destination, K);
}
```

- `schedule(dynamic)`: balance de carga automático (consultas con costos distintos).
- Sin mutex: cada hilo escribe en su propia posición `results[i]`.

### Paralelización MPI

```
Rank 0 → MPI_Bcast(grafo)   → todos los procesos
Rank 0 → MPI_Scatter(consultas) → cada proceso recibe su porción
Todos  → Dijkstra local
Todos  → MPI_Gather(resultados) → Rank 0 consolida
```

---

## Resultados del Benchmark

Tiempos promedio (3 repeticiones), dataset Large (1 000 ciudades, 10 000 consultas):

| Configuración | Tiempo (ms) | Speedup | Eficiencia |
|---|---|---|---|
| Secuencial | 7,006 | — | — |
| OpenMP 2 hilos | 3,567 | 1.96x | 98% |
| OpenMP 4 hilos | 2,293 | 3.06x | 76% |
| OpenMP 8 hilos | 2,302 | 3.04x | 38% |
| OpenMP 16 hilos | 2,244 | 3.12x | 20% |
| MPI 1 proceso | 6,961 | 1.01x | — |
| MPI 2 procesos | 7,216 | 0.97x | ⚠️ |
| MPI 3 procesos | 2,527 | **2.77x** | **92%** |

**Fracción serial estimada (Amdahl):** ~27.5% → Speedup máximo teórico: 3.64x

---

## Datos

Las distancias en `cities.csv` y `routes.csv` son **estimaciones basadas en rutas
viales conocidas de la región** y no deben tomarse como mediciones geodésicas exactas.
Se usan como datos de prueba realistas para el contexto académico.

Los datasets `medium` y `large` son sintéticos, generados con `scripts/generate_data.sh`.

---

## Estado del Proyecto

- [x] Fase 1: Estructura + Datos CSV
- [x] Fase 2: Grafo + Dijkstra (verificado con 6 tests)
- [x] Fase 3: Versión Secuencial
- [x] Fase 4: Versión OpenMP (resultados idénticos al secuencial)
- [x] Fase 5: Infraestructura Docker (3 nodos, SSH entre contenedores)
- [x] Fase 6: Versión MPI (Bcast + Scatter + Gather, resultados idénticos)
- [x] Fase 7: Benchmarking (27 experimentos, 3 repeticiones c/u)
- [x] Fase 8: Documentación

---

## Autor

Proyecto individual — TEL420 Sistemas Paralelos
