# Backend REST API – Optimizador de Rutas Gran Chaco

Módulo backend en C++ para el cálculo y optimización de rutas de transporte en la región del Gran Chaco (Bolivia, Argentina, Paraguay), con punto neurálgico en la ciudad de Yacuiba.

Desarrollado para la materia **TEL420 – Sistemas Paralelos**.

---

## 1. Características Técnicas

- **Lenguaje:** C++17
- **Librería HTTP / Servidor REST:** `cpp-httplib` (header-only, multi-hilo con `pthread`)
- **Algoritmo principal:** Dijkstra para caminos mínimos y búsqueda heurística de rutas alternativas.
- **Formato de datos:** Lectura desde CSV (`data/cities.csv` y `data/routes.csv`).
- **Arquitectura:** Modular (`src/common/` para grafos y rutas, `src/api/` para endpoints HTTP, `src/main.cpp` para inicialización).

---

## 2. Estructura de Directorios

```
backend/
├── CMakeLists.txt        # Configuración para compilación con CMake
├── build.sh              # Script rápido de compilación con g++
├── include/
│   └── httplib.h         # Biblioteca cpp-httplib v0.14+
├── src/
│   ├── main.cpp          # Punto de entrada y servidor HTTP
│   ├── api/
│   │   ├── router.hpp    # Declaración de endpoints y CORS
│   │   └── router.cpp    # Implementación de endpoints REST y serialización JSON
│   └── common/
│       ├── graph.hpp/cpp # Representación del grafo (ciudades y carreteras)
│       └── route.hpp/cpp # Algoritmo Dijkstra y rutas alternativas
└── bin/
    └── servidor          # Binario compilado
```

---

## 3. Compilación

### Opción A: Script directo (Recomendado)

Desde la raíz del proyecto:

```bash
bash backend/build.sh
```

### Opción B: Con CMake

```bash
cd backend
mkdir -p build && cd build
cmake ..
cmake --build .
```

---

## 4. Ejecución del Servidor

El servidor debe ejecutarse desde la raíz del proyecto para que las rutas relativas `./data` y `./frontend` sean accesibles:

```bash
cd /ruta/al/proyecto-transporte-paralelo
./backend/bin/servidor
```

Por defecto, escucha en:
- **Frontend Web:** `http://localhost:8080/`
- **Base API REST:** `http://localhost:8080/api/`

---

## 5. Endpoints de la API REST

### `GET /api/cities`
Retorna la lista de todas las ciudades registradas.
- **Respuesta (JSON Array):**
  ```json
  [
    {
      "id": 0,
      "name": "Yacuiba",
      "country": "Bolivia",
      "lat": -21.9667,
      "lon": -63.6833
    },
    ...
  ]
  ```

### `GET /api/routes`
Retorna todas las conexiones (carreteras) entre ciudades con sus distancias en kilómetros.
- **Respuesta (JSON Array):**
  ```json
  [
    {
      "from_id": 0,
      "to_id": 1,
      "distance_km": 100.0
    },
    ...
  ]
  ```

### `POST /api/route/shortest`
Calcula la ruta más corta entre una ciudad de origen y una de destino usando el algoritmo Dijkstra, junto con posibles rutas alternativas.
- **Cabeceras:** `Content-Type: application/json`
- **Cuerpo (JSON):**
  ```json
  {
    "origin_id": 0,
    "destination_id": 12
  }
  ```
- **Respuesta (JSON):**
  ```json
  {
    "found": true,
    "origin_id": 0,
    "destination_id": 12,
    "total_distance": 473.0,
    "execution_time_ms": 0.012,
    "path": [0, 8, 9, 10, 11, 12],
    "path_names": ["Yacuiba", "Salvador Mazza", "Tartagal", "Embarcacion", "Oran", "Salta"],
    "path_coords": [[-21.9667, -63.6833], ...],
    "alternatives": [
      {
        "total_distance": 860.0,
        "path_names": ["Yacuiba", "Villamontes", "Entre Rios", "Tarija", "Bermejo", "Oran", "Salta"],
        "path_coords": [...]
      }
    ]
  }
  ```

### `GET /api/stats`
Retorna métricas del servidor en tiempo real.
- **Respuesta (JSON):**
  ```json
  {
    "cities_count": 25,
    "routes_count": 29,
    "total_queries": 4,
    "queries_count": 4,
    "avg_time_ms": 0.012
  }
  ```

### `GET /api/benchmark`
Retorna los resultados experimentales completos de rendimiento: Secuencial vs OpenMP vs OpenMPI (Speedup, Eficiencia, Tiempos medidos para Small, Medium y Large).
- **Respuesta (JSON):**
  ```json
  {
    "datasets": ["large", "medium", "small"],
    "summary": [
      {
        "version": "openmp",
        "dataset": "large",
        "workers": 4,
        "queries": 10000,
        "avg_time_ms": 2292.6,
        "speedup": 3.06,
        "efficiency": 0.77
      },
      ...
    ]
  }
  ```
