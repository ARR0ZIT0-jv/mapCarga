# GUÍA MAESTRA DE DEFENSA: mapCarga (OPTIMIZACIÓN DE RUTAS DE TRANSPORTE)
**Materia:** TEL-420 Sistemas Paralelos  
**Duración Total:** 20 minutos (10 minutos Exposición + 10 minutos Demostración en Vivo)  
**Proyecto:** Optimización de Rutas de Transporte de Mercancías en el Gran Chaco (Dijkstra + OpenMP + OpenMPI)

---

## 1. RESUMEN EJECUTIVO DEL PROYECTO
- **Objetivo:** Resolver lotes masivos de consultas de transporte de carga (pares origen-destino entre ciudades de Bolivia, Argentina y Paraguay conectadas por Yacuiba) calculando la ruta más corta y hasta 3 alternativas (Dijkstra + Yen simplificado).
- **Paradigmas Evaluados:**
  1. **Secuencial:** Línea base monohilo ($T(1)$).
  2. **OpenMP:** Memoria compartida con `#pragma omp parallel for schedule(dynamic)`.
  3. **OpenMPI:** Memoria distribuida sobre un clúster contenedorizado de 3 nodos (`master`, `worker1`, `worker2`).
- **Datasets de Evaluación:**
  - `small`: 25 ciudades, 29 conexiones viales, 100 consultas.
  - `medium`: 200 ciudades, 799 conexiones viales, 1.000 consultas.
  - `large`: 200 ciudades, 799 conexiones viales, 10.000 consultas.

---

## 2. INFRAESTRUCTURA DEL CLÚSTER DOCKER (Obligatorio)

### Arquitectura de Red y Contenedores
```
                      HOST FÍSICO / SERVIDOR
                                │
          Red Virtual Docker Bridge (mpi_network: 172.x.x.x)
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
   ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
   │   master    │       │   worker1   │       │   worker2   │
   │  (Rank 0)   │       │  (Rank 1)   │       │  (Rank 2)   │
   │ Coordinador │       │ Cómputo     │       │ Cómputo     │
   └──────┬──────┘       └─────────────┘       └─────────────┘
          │                     ▲                     ▲
          └───── SSH (RSA) ─────┴─────────────────────┘
```

- **Definición en `docker-compose.yml`:**
  - 3 servicios independientes: `master`, `worker1` y `worker2` compartiendo la red interna `mpi_network`.
  - Los contenedores se basan en una imagen Ubuntu con GCC, G++, CMake, OpenMPI y OpenSSH.
- **Autenticación sin Contraseña (Passwordless SSH):**
  - Cada contenedor ejecuta un servidor SSH (`sshd`).
  - Durante el build de Docker, se genera un par de llaves criptográficas RSA para el usuario `mpiuser` y la llave pública se agrega a `authorized_keys`.
  - Esto permite a `mpirun` lanzar procesos remotos en `worker1` y `worker2` sin requerir clave interactiva.

---

## 3. OPENMP A FONDO: CÓDIGO Y FUNCIONAMIENTO

### Código Crucial (`src/openmp/main.cpp`)
```cpp
// 1. Configurar número de hilos según parámetro de consola
omp_set_num_threads(num_threads);

int total_queries = queries.size();
std::vector<QueryResult> results(total_queries);

// 2. Directiva Maestra de Paralelización
#pragma omp parallel for schedule(dynamic)
for (int i = 0; i < total_queries; i++) {
    results[i].query = queries[i];

    // Cada hilo ejecuta Dijkstra de forma independiente
    results[i].alternatives = find_alternative_routes(
        graph,
        queries[i].origin,
        queries[i].destination,
        K_ALTERNATIVES
    );
}
```

### Respuestas a las Preguntas Clave del Docente:

#### ¿Por qué no hay Condiciones de Carrera (*Race Conditions*)?
1. **Acceso a Memoria Exclusivo:** El vector de resultados `results` tiene un tamaño preasignado de $N$ celdas. La iteración $i$ escribe únicamente en la posición `results[i]`. Jamás dos hilos intentan modificar la misma celda de memoria.
2. **Grafo Inmutable (*Read-Only*):** El grafo vial compartido nunca se modifica durante la fase de cálculo; todos los hilos solo lo leen de forma concurrente.
3. **Variables de Dijkstra Locales:** Las colas de prioridad (`std::priority_queue`) y los mapas de distancias se crean en el *stack* privado de cada hilo al invocar la función.

#### ¿Por qué `schedule(dynamic)` y no `schedule(static)`?
- En un cálculo numérico simple (como multiplicar matrices o fórmulas aritméticas fijas), cada iteración tarda exactamente lo mismo, por lo que `static` es ideal.
- En **Dijkstra sobre grafos viales**, el tiempo de ejecución depende de la distancia y topología entre el origen y destino: encontrar la ruta entre dos ciudades vecinas toma microsegundos y explora 5 nodos, mientras que una ruta de frontera a frontera explora cientos de nodos.
- Con `schedule(static)`, si a un hilo le tocan por azar varias rutas largas consecutivas, quedará trabajando mientras los otros hilos están ociosos.
- Con `schedule(dynamic)`, OpenMP asigna las consultas dinámicamente como en una cola de trabajo: **el hilo que termina una consulta toma de inmediato la siguiente**, logrando un balance de carga perfecto.

---

## 4. TABLA OFICIAL DE PRUEBAS EXPERIMENTALES (OpenMP)

Datos reales obtenidos de las corridas del clúster (`results/tables/benchmark_summary.csv`):

| Dataset | Consultas | Hilos | Tiempo Promedio | Speedup $S(p)$ | Eficiencia $E(p)$ | Análisis / Observaciones |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Small** | 100 | 1 | 0.622 ms | 1.000x | 100.0% | Línea base monohilo |
| **Small** | 100 | 2 | 0.430 ms | **1.446x** | **72.3%** | Aceleración inicial |
| **Small** | 100 | 4 | 0.442 ms | 1.407x | 35.2% | Overhead de hilos |
| **Small** | 100 | 16 | 1.238 ms | **0.502x** | **3.1%** | **Degradación por sobre-suscripción** |
| **Medium** | 1.000 | 1 | 100.00 ms | 1.000x | 100.0% | Línea base mediana |
| **Medium** | 1.000 | 2 | 58.42 ms | **1.712x** | **85.6%** | Excelente escalabilidad |
| **Medium** | 1.000 | 4 | 49.17 ms | **2.034x** | **50.8%** | Speedup superior a 2x |
| **Medium** | 1.000 | 8 | 30.67 ms | **3.260x** | **40.8%** | Mejor tiempo en dataset mediano |
| **Large** | 10.000 | 1 | 6.950,47 ms (6.95 s) | 1.000x | 100.0% | Cómputo pesado secuencial |
| **Large** | 10.000 | 2 | 3.567,02 ms (3.56 s) | **1.948x** | **97.4%** | **Eficiencia casi ideal (97.4%)** |
| **Large** | 10.000 | 4 | 2.292,60 ms (2.29 s) | **3.031x** | **75.8%** | **Speedup superior a 3x** |
| **Large** | 10.000 | 16 | 2.244,11 ms (2.24 s) | 3.097x | 19.3% | Límite por número de núcleos físicos |

---

## 5. COMPARATIVA CON MPI (Memoria Distribuida)

En el dataset **Large (10.000 consultas)**:
- **1 proceso (Master):** 6.961 ms (6.96 s)
- **2 procesos (Master + Worker1):** 7.215 ms (penalizado por overhead de red)
- **3 procesos (Master + Worker1 + Worker2):** **2.526 ms (2.52 s) $\to$ Speedup de 2.755x**

---

## 6. GUÍA DE DEMOSTRACIÓN EN VIVO (10 Minutos)

Ejecuta estos pasos en la terminal frente al docente:

```bash
# PASO 1: Levantar los 3 nodos del clúster Docker
cd infrastructure
docker compose up -d
docker ps

# PASO 2: Entrar al nodo Master
docker compose exec master bash

# PASO 3: Compilar los ejecutables de forma limpia
bash scripts/compile.sh

# PASO 4: Demostración dinámica de OpenMP (Variar hilos)
# Monohilo:
./build/openmp large 1
# 2 hilos (mostrar la caída a la mitad del tiempo):
./build/openmp large 2
# 4 hilos:
./build/openmp large 4

# PASO 5: Demostración distribuida con MPI en los 3 nodos
mpirun -np 3 --host master,worker1,worker2 /app/build/mpi large

# PASO 6: Interfaz Gráfica Web
# Abrir navegador en http://localhost:8080 y mostrar el mapa interactivo de Leaflet
```
