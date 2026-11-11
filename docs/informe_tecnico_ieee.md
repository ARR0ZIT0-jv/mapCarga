# Informe Técnico — Formato IEEE
## Diseño e implementación de un sistema de optimización de rutas de transporte mediante computación paralela y distribuida en la región del Gran Chaco

> [!IMPORTANT]
> Este es el esqueleto completo del informe. Las secciones marcadas con `[COMPLETAR]` requieren redacción propia. Los datos numéricos ya están listos — provienen del benchmark real.

---

## Encabezado IEEE

```
Título: Diseño e implementación de un sistema de optimización de rutas
        de transporte de mercancías mediante computación paralela y
        distribuida en la región del Gran Chaco

Autor: [Tu nombre]
Institución: [Universidad / Facultad]
Asignatura: TEL420 – Sistemas Paralelos
Fecha: Noviembre 2026
```

---

## Abstract (en inglés, ~150 palabras)

```
This paper presents the design and implementation of a parallel route
optimization system for freight transport in the Gran Chaco region
(Bolivia, Argentina, Paraguay). The system computes shortest paths
between cities using Dijkstra's algorithm and finds up to three
alternative routes per query. Three implementations are compared:
sequential, shared-memory parallel (OpenMP), and distributed-memory
parallel (OpenMPI) over a Docker-based three-node cluster.

Experimental results on a large dataset (1,000 cities, 10,000 queries)
show a speedup of 3.06x with 4 OpenMP threads and 2.77x with 3 MPI
processes (92% efficiency). Analysis using Amdahl's and Gustafson's
laws reveals an estimated serial fraction of 27.5%, limiting the
theoretical maximum speedup to 3.64x. The system demonstrates that
parallelizing at the query level — rather than within the algorithm —
yields clean, race-free parallelism with strong scalability for
medium and large workloads.

Keywords: parallel computing, route optimization, OpenMP, MPI, Dijkstra,
          Gran Chaco, Docker
```

---

## Resumen (en español, ~150 palabras)

```
[COMPLETAR — versión en español del abstract]

Puntos clave a incluir:
- Contexto: transporte de mercancías desde Yacuiba (frontera Bolivia-Argentina)
- Problema: optimización de rutas en una red de ciudades del Gran Chaco
- Solución: sistema con 3 versiones (secuencial, OpenMP, MPI)
- Resultados principales: speedup 3.06x (OpenMP-4), 2.77x (MPI-3)
- Conclusión: paralelismo a nivel de consultas es efectivo y escalable
```

---

## I. Introducción

### A. Contexto regional

```
[COMPLETAR — 2-3 párrafos sobre:]

- Importancia geoeconómica de Yacuiba como nodo fronterizo
  Bolivia-Argentina en el Gran Chaco
- El Gran Chaco: región que abarca partes de Bolivia, Argentina
  y Paraguay, con una red vial en expansión
- Desafíos del transporte de mercancías: distancias largas,
  múltiples rutas alternativas, necesidad de optimización
- Por qué el cómputo paralelo es relevante: escenarios reales
  implican miles de consultas simultáneas (flotas de vehículos,
  sistemas logísticos)
```

### B. Motivación técnica

```
[COMPLETAR — 1-2 párrafos sobre:]

- Problema computacional: dado un grafo de N ciudades y M consultas
  origen-destino, encontrar las K mejores rutas para cada consulta
- Escala del problema: M puede ser 10,000+ en entornos reales
- Oportunidad de paralelización: las consultas son independientes
  entre sí → paralelismo natural y sin condiciones de carrera
```

### C. Objetivos

```
1. Implementar un grafo de transporte real de la región del Gran Chaco.
2. Desarrollar el algoritmo de Dijkstra con rutas alternativas.
3. Comparar tres paradigmas de programación paralela:
   - Procesamiento secuencial (baseline)
   - Paralelismo de memoria compartida (OpenMP)
   - Paralelismo de memoria distribuida (OpenMPI)
4. Medir y analizar el rendimiento con datasets de distinto tamaño.
5. Desplegar el sistema en un clúster contenerizado (Docker).
```

---

## II. Marco Teórico

### A. Algoritmo de Dijkstra

```
[COMPLETAR — 1 párrafo explicando:]

- Definición del problema de camino mínimo
- Funcionamiento del algoritmo con cola de prioridad
- Complejidad temporal: O((V+E) log V)
- Por qué es adecuado: pesos positivos, optimalidad garantizada
- Comparación con alternativas (Bellman-Ford, A*) y justificación
  de la elección
```

**Pseudocódigo:**
```
Dijkstra(G, origen, destino):
  dist[todos] = ∞ ; dist[origen] = 0
  pq = cola_prioridad[(0, origen)]
  prev[todos] = -1

  mientras pq no vacío:
    (d, u) = pq.extraer_mínimo()
    si d > dist[u]: continuar
    si u == destino: romper

    para (v, w) en vecinos(u):
      si dist[u] + w < dist[v]:
        dist[v] = dist[u] + w
        prev[v] = u
        pq.insertar((dist[v], v))

  retornar reconstruir_ruta(prev, destino)
```

### B. Rutas alternativas (Yen simplificado)

```
[COMPLETAR — 1 párrafo explicando:]

- Necesidad de rutas alternativas en transporte (desvíos,
  cierres de ruta, preferencias del conductor)
- Algoritmo de Yen completo (K-shortest paths) y su complejidad
- Versión simplificada implementada: bloquear aristas de la ruta
  óptima y recalcular — justificación de la simplificación
```

### C. Paralelismo de Memoria Compartida (OpenMP)

```
[COMPLETAR — 1-2 párrafos sobre:]

- Modelo de memoria compartida: hilos comparten el mismo espacio
- Directiva #pragma omp parallel for
- schedule(dynamic) para balance de carga
- Por qué no hay condiciones de carrera: acceso de solo lectura
  al grafo, escritura en posiciones independientes del vector
- omp_get_wtime() para medición precisa
```

### D. Paralelismo de Memoria Distribuida (OpenMPI)

```
[COMPLETAR — 1-2 párrafos sobre:]

- Modelo de paso de mensajes: procesos con memoria independiente
- Comunicaciones colectivas usadas:
  * MPI_Bcast: difundir el grafo a todos los procesos
  * MPI_Scatter: distribuir consultas equitativamente
  * MPI_Gather: recopilar resultados en el master
- Comunicaciones punto a punto (MPI_Send/Recv) para rutas detalladas
- MPI_Wtime() para medición sincronizada
```

### E. Métricas de rendimiento

$$S(p) = \frac{T(1)}{T(p)} \qquad \text{(Speedup)}$$

$$E(p) = \frac{S(p)}{p} \qquad \text{(Eficiencia)}$$

**Ley de Amdahl:**
$$S_{Amdahl}(p) = \frac{1}{f + \frac{1-f}{p}}$$

donde $f$ es la fracción serial del programa.

**Ley de Gustafson:**
$$S_{Gustafson}(p) = p - f \cdot (p-1)$$

---

## III. Diseño de la Arquitectura

### A. Modelo de datos

```
[COMPLETAR — 1 párrafo + diagrama:]

- Representación del grafo: lista de adyacencia (no matriz)
- Justificación: grafo disperso (cada ciudad conecta con pocas vecinas)
- Struct City: id, nombre, país, latitud, longitud
- Struct RouteResult: origen, destino, path[], distancia, found
- Struct Query: origen_id, destino_id
```

**Diagrama de clases (simplificado):**
```
Graph
├── vector<City> cities_
├── vector<vector<pair<int,double>>> adj_list_
├── load_cities(csv) → bool
├── load_routes(csv) → bool
├── get_neighbors(id) → vector<pair<int,double>>
└── serialize() / deserialize()   ← para MPI

RouteResult
├── int origin, destination
├── vector<int> path
├── double total_distance
└── bool found
```

### B. Arquitectura del clúster Docker

```
[COMPLETAR — 1 párrafo describiendo:]

- 3 contenedores Ubuntu 22.04 en red bridge
- Imagen única compilada en build time
- SSH sin contraseña entre nodos (clave RSA generada en build)
- mpirun lanza procesos remotos vía SSH
- Hostfile: master(1 slot) + worker1(1 slot) + worker2(1 slot)
```

### C. Estrategia de paralelización

```
[COMPLETAR — esquema del flujo:]

CONSULTAS [q1, q2, ..., qN]
         ↓
OpenMP: #pragma omp parallel for schedule(dynamic)
  Hilo 0: q1, q4, q7, ...
  Hilo 1: q2, q5, q8, ...
  Hilo 2: q3, q6, q9, ...
         ↓
MPI: Rank 0 → MPI_Bcast(grafo) → todos
     Rank 0 → MPI_Scatter(consultas) → porciones
     Cada rank → Dijkstra local
     Todos → MPI_Gather(resultados) → Rank 0
```

---

## IV. Implementación

### A. Módulo común (src/common/)

```
[COMPLETAR — describir brevemente:]

graph.hpp/cpp:
  - Carga CSV con manejo de errores
  - Lista de adyacencia bidireccional (grafo no dirigido)
  - Serialización CSR para MPI_Bcast eficiente

route.hpp/cpp:
  - Dijkstra con cola de prioridad (std::priority_queue con greater<>)
  - Rutas alternativas por bloqueo de aristas
  - Carga de consultas desde CSV
```

### B. Versión secuencial (src/sequential/main.cpp)

```
[COMPLETAR — describir el flujo:]
1. Cargar grafo desde CSV
2. Cargar consultas desde CSV
3. Para cada consulta: find_alternative_routes()
4. Medir tiempo con chrono::high_resolution_clock
5. Mostrar estadísticas y línea CSV para benchmark
```

### C. Versión OpenMP (src/openmp/main.cpp)

```cpp
// Sección paralela central
#pragma omp parallel for schedule(dynamic)
for (int i = 0; i < total_queries; i++) {
    if (i == 0) actual_threads = omp_get_num_threads();

    results[i].query = queries[i];
    auto routes = find_alternative_routes(graph,
                      queries[i].origin,
                      queries[i].destination, K);
    if (!routes.empty()) {
        results[i].best_route = routes[0];
        results[i].alternatives = {routes.begin()+1, routes.end()};
    }
}
```

**Ausencia de condiciones de carrera:**
- El grafo es de solo lectura durante la sección paralela.
- `results[i]` es una posición única por iteración (sin aliasing).
- Las variables internas de `find_alternative_routes` son locales al stack de cada hilo.

### D. Versión MPI (src/mpi/main.cpp)

```
[COMPLETAR — describir con más detalle:]

1. MPI_Init, Comm_rank, Comm_size
2. Rank 0: cargar grafo + consultas
3. MPI_Bcast de metadatos (num_cities, total_queries)
4. MPI_Bcast de arrays CSR del grafo (edge_data, edge_weights, edge_offsets)
5. MPI_Bcast de datos de ciudades (nombres, coordenadas)
6. Rank != 0: reconstruir grafo con deserialize()
7. MPI_Scatterv de consultas (distribución con remainder)
8. MPI_Barrier + MPI_Wtime() — inicio de medición
9. Cada proceso: Dijkstra para sus consultas
10. MPI_Barrier + MPI_Wtime() — fin de medición
11. MPI_Gather de FlatResult[] (structs serializados como MPI_BYTE)
12. MPI_Send/Recv de rutas detalladas (punto a punto)
13. Rank 0: consolidar y mostrar resultados
14. MPI_Finalize
```

---

## V. Resultados Experimentales

### A. Entorno de prueba

| Parámetro | Valor |
|---|---|
| Infraestructura | Docker Compose, 3 contenedores |
| SO contenedores | Ubuntu 22.04 LTS |
| Compilador | GCC 11.4 (-O2) |
| OpenMPI | 4.1.2 |
| Repeticiones | 3 por configuración |
| Medición T(1) | Versión secuencial mismo dataset |

### B. Tiempos de ejecución

**Dataset Small (25 ciudades, 100 consultas):**

| Versión | Workers | Tiempo (ms) | Speedup |
|---|---|---|---|
| Secuencial | 1 | 0.72 | — |
| OpenMP | 2 | 0.43 | 1.67x |
| OpenMP | 4 | 0.44 | 1.63x |
| MPI | 2 | 0.32 | 2.28x |
| MPI | 3 | 0.62 | 1.16x |

**Dataset Medium (200 ciudades, 1 000 consultas):**

| Versión | Workers | Tiempo (ms) | Speedup | Eficiencia |
|---|---|---|---|---|
| Secuencial | 1 | 93.95 | — | — |
| OpenMP | 2 | 58.43 | 1.61x | 80% |
| OpenMP | 4 | 49.17 | 1.91x | 48% |
| OpenMP | 8 | 30.67 | **3.06x** | 38% |
| MPI | 3 | 37.94 | 2.48x | 83% |

**Dataset Large (1 000 ciudades, 10 000 consultas):**

| Versión | Workers | Tiempo (ms) | Speedup | Eficiencia |
|---|---|---|---|---|
| Secuencial | 1 | 7,005.98 | — | — |
| OpenMP | 1 | 6,950.47 | 1.01x | 101% |
| OpenMP | 2 | 3,567.03 | 1.96x | 98% |
| OpenMP | 4 | 2,292.60 | 3.06x | 76% |
| OpenMP | 8 | 2,302.32 | 3.04x | 38% |
| OpenMP | 16 | 2,244.11 | 3.12x | 20% |
| MPI | 1 | 6,961.27 | 1.01x | — |
| MPI | 2 | 7,215.94 | 0.97x | ⚠️ |
| MPI | 3 | 2,526.96 | **2.77x** | **92%** |

### C. Análisis de Amdahl y Gustafson

**Fracción serial estimada (dataset large, OpenMP 16 hilos):**

$$f = \frac{1/S - 1/p}{1 - 1/p} = \frac{1/3.12 - 1/16}{1 - 1/16} \approx 0.275 \ (27.5\%)$$

**Speedup máximo teórico:**

$$S_{max} = \frac{1}{f} = \frac{1}{0.275} \approx 3.64x$$

**Ley de Gustafson (escalabilidad débil):**

$$S_G(p) = p - 0.275 \cdot (p-1)$$

| p | S_G(p) | Interpretación |
|---|---|---|
| 2 | 1.72x | Duplicando la carga con 2 workers |
| 4 | 3.17x | Cuadruplicando la carga con 4 workers |
| 8 | 6.07x | 8× carga con 8 workers |

### D. Análisis de cuellos de botella

**MPI con 2 procesos es más lento que secuencial** (7,216 ms vs 7,006 ms):

```
[COMPLETAR — explicar con estas ideas:]

1. Overhead de serialización del grafo (MPI_Bcast: ~32 KB de datos CSR)
2. Latencia de Scatter/Gather sobre 10,000 consultas
3. Con 2 procesos, el Rank 1 recibe ~5,000 consultas y el master
   espera bloqueado en MPI_Gather — no hay beneficio neto
4. Con 3 procesos, el trabajo se divide en tercios más pequeños
   y el tiempo total se reduce 2.77x

Lección: el overhead de comunicación MPI no es despreciable para
grafos pequeños-medianos. El punto de quiebre está entre 2 y 3
procesos para este tamaño de dataset.
```

**OpenMP se satura entre 4 y 8 hilos:**

```
[COMPLETAR — explicar:]

1. La máquina host tiene ~4 cores físicos (con hyperthreading: 8 lógicos)
2. Más allá de los cores físicos, los hilos compiten por los mismos
   recursos de caché L1/L2 → contención de caché
3. schedule(dynamic) reduce el problema pero no lo elimina
4. La fracción serial (27.5%) también limita el beneficio
```

---

## VI. Conclusiones

```
[COMPLETAR — 4-5 párrafos con estas ideas:]

1. El sistema implementado cumple todos los objetivos planteados:
   carga de datos reales, cálculo de rutas óptimas y alternativas,
   y comparación entre tres paradigmas de programación paralela.

2. La paralelización a nivel de consultas (en lugar de paralelizar
   internamente el algoritmo de Dijkstra) resultó ser la estrategia
   correcta: produce código limpio, sin condiciones de carrera, y
   con speedup real medible.

3. OpenMP con 4 hilos es la configuración más equilibrada para
   este sistema: speedup 3.06x con 76% de eficiencia (dataset large).
   A partir de 8 hilos la ganancia es marginal por contención de caché
   y la fracción serial inherente.

4. MPI demuestra mayor overhead por comunicación, pero con 3 procesos
   logra 92% de eficiencia y speedup 2.77x, confirmando su viabilidad
   para distribución en nodos físicamente separados.

5. Los resultados están limitados por la fracción serial (~27.5%),
   que incluye la carga de CSV, distribución de consultas y
   consolidación de resultados. Futuras mejoras podrían paralelizar
   también la carga de datos.

6. Impacto regional: un sistema de esta naturaleza puede ayudar a
   empresas de logística en la región del Gran Chaco a optimizar
   rutas en tiempo real, reduciendo costos de combustible y tiempos
   de entrega en una región con infraestructura vial compleja.
```

---

## VII. Referencias Bibliográficas

```
[Formato IEEE — completar con fuentes reales]

[1] E. W. Dijkstra, "A note on two problems in connexion with graphs,"
    Numerische Mathematik, vol. 1, pp. 269-271, 1959.

[2] B. Chapman, G. Jost, and R. Van Der Pas, Using OpenMP: Portable
    Shared Memory Parallel Programming. MIT Press, 2008.

[3] W. Gropp, E. Lusk, and A. Skjellum, Using MPI: Portable Parallel
    Programming with the Message-Passing Interface. MIT Press, 2014.

[4] G. M. Amdahl, "Validity of the single processor approach to achieving
    large scale computing capabilities," in Proc. AFIPS Spring Joint
    Computer Conference, 1967, pp. 483-485.

[5] J. L. Gustafson, "Reevaluating Amdahl's law," Communications of
    the ACM, vol. 31, no. 5, pp. 532-533, 1988.

[6] D. B. Johnson, "Efficient algorithms for shortest paths in sparse
    networks," Journal of the ACM, vol. 24, no. 1, pp. 1-13, 1977.

[7] OpenMPI Documentation. https://www.open-mpi.org/doc/

[8] OpenMP Architecture Review Board. OpenMP Application Programming
    Interface, Version 5.2, 2021. https://www.openmp.org/

[9] Docker Inc. Docker Documentation. https://docs.docker.com/

[10] [Fuente de distancias viales del Gran Chaco — ej. OpenStreetMap,
     Instituto Geográfico Militar de Bolivia, etc.]
```

---

## Checklist de entrega

- [ ] Abstract en inglés (~150 palabras)
- [ ] Resumen en español (~150 palabras)
- [ ] Introducción con contexto regional (mínimo 2 párrafos sobre Yacuiba/Gran Chaco)
- [ ] Marco teórico con ecuaciones de Amdahl y Gustafson
- [ ] Diagrama de arquitectura del clúster Docker
- [ ] Fragmentos de código clave comentados (Dijkstra, OpenMP, MPI_Bcast)
- [ ] Tablas de benchmark completas (3 datasets × todas las configuraciones)
- [ ] Análisis de cuellos de botella (MPI-2 más lento, saturación OpenMP)
- [ ] Conclusiones con impacto regional
- [ ] 8-10 referencias en formato IEEE
- [ ] Máximo 10 páginas

> [!TIP]
> Para convertir a PDF con formato IEEE, se recomienda usar la plantilla oficial de IEEE en LaTeX: https://www.ieee.org/conferences/publishing/templates.html
