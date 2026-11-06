#!/bin/bash
# =============================================================================
# benchmark.sh
# Ejecuta el benchmark completo: secuencial, OpenMP y MPI.
# Genera una tabla CSV con todos los resultados.
#
# Uso (dentro de Docker):
#   bash /app/scripts/benchmark.sh
#
# Uso (fuera de Docker, solo secuencial y OpenMP):
#   bash scripts/benchmark.sh --local
#
# Cada configuración se ejecuta RUNS veces y se promedian los tiempos.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
RESULTS_DIR="${PROJECT_DIR}/results/tables"
mkdir -p "$RESULTS_DIR"

# Número de repeticiones por experimento
RUNS=3

# Modo local (sin MPI distribuido)
LOCAL_MODE=false
if [[ "${1:-}" == "--local" ]]; then
    LOCAL_MODE=true
fi

# Archivo de resultados
OUTPUT_FILE="${RESULTS_DIR}/benchmark_results.csv"
echo "version,dataset,workers,consultas,tiempo_ms,rutas_encontradas,run" > "$OUTPUT_FILE"

DATASETS=("small" "medium" "large")
OMP_THREADS=(1 2 4 8 16)
MPI_PROCS=(1 2 3)

# Detectar rutas de binarios
if [ -f "/app/bin/sequential" ]; then
    BIN_DIR="/app/bin"
    HOSTFILE="/app/hostfile"
else
    BIN_DIR="${PROJECT_DIR}/bin"
    HOSTFILE=""
fi

# Función para extraer el tiempo de la salida del programa
extract_time() {
    echo "$1" | grep "Linea CSV" -A1 | tail -1 | tr -d ' ' | cut -d',' -f5
}

extract_csv_line() {
    echo "$1" | grep "Linea CSV" -A1 | tail -1 | tr -d ' '
}

echo "============================================================"
echo "  BENCHMARK COMPLETO"
echo "  Repeticiones por experimento: ${RUNS}"
echo "  Datasets: ${DATASETS[*]}"
echo "============================================================"
echo ""

# =============================
# SECUENCIAL
# =============================
echo ">>> VERSION SECUENCIAL"
for ds in "${DATASETS[@]}"; do
    for ((r=1; r<=RUNS; r++)); do
        output=$("${BIN_DIR}/sequential" "$ds" 2>&1)
        csv=$(extract_csv_line "$output")
        if [ -n "$csv" ]; then
            echo "${csv},${r}" >> "$OUTPUT_FILE"
            time_ms=$(echo "$csv" | cut -d',' -f5)
            echo "  [run $r] sequential, $ds: ${time_ms} ms"
        fi
    done
done
echo ""

# =============================
# OPENMP
# =============================
echo ">>> VERSION OPENMP"
for ds in "${DATASETS[@]}"; do
    for t in "${OMP_THREADS[@]}"; do
        for ((r=1; r<=RUNS; r++)); do
            output=$("${BIN_DIR}/openmp" "$ds" "$t" 2>&1)
            csv=$(extract_csv_line "$output")
            if [ -n "$csv" ]; then
                echo "${csv},${r}" >> "$OUTPUT_FILE"
                time_ms=$(echo "$csv" | cut -d',' -f5)
                echo "  [run $r] openmp $t hilos, $ds: ${time_ms} ms"
            fi
        done
    done
done
echo ""

# =============================
# MPI (solo si no es modo local)
# =============================
if [ "$LOCAL_MODE" = false ] && [ -f "${BIN_DIR}/mpi_solver" ]; then
    echo ">>> VERSION MPI"
    for ds in "${DATASETS[@]}"; do
        for np in "${MPI_PROCS[@]}"; do
            HOSTFILE_ARG=""
            if [ -n "$HOSTFILE" ] && [ "$np" -gt 1 ]; then
                HOSTFILE_ARG="--hostfile ${HOSTFILE}"
            fi
            for ((r=1; r<=RUNS; r++)); do
                output=$(mpirun $HOSTFILE_ARG --allow-run-as-root -np "$np" "${BIN_DIR}/mpi_solver" "$ds" 2>&1)
                csv=$(extract_csv_line "$output")
                if [ -n "$csv" ]; then
                    echo "${csv},${r}" >> "$OUTPUT_FILE"
                    time_ms=$(echo "$csv" | cut -d',' -f5)
                    echo "  [run $r] mpi $np procs, $ds: ${time_ms} ms"
                fi
            done
        done
    done
    echo ""
fi

echo "============================================================"
echo "  BENCHMARK COMPLETADO"
echo "  Resultados guardados en: ${OUTPUT_FILE}"
echo "============================================================"
echo ""

# =============================
# GENERAR TABLA RESUMEN
# =============================
echo ">>> GENERANDO TABLA RESUMEN..."

SUMMARY_FILE="${RESULTS_DIR}/benchmark_summary.csv"
echo "version,dataset,workers,consultas,tiempo_promedio_ms,tiempo_min_ms,tiempo_max_ms,rutas" > "$SUMMARY_FILE"

# Calcular promedios por grupo (version, dataset, workers)
# Usamos awk para agrupar y calcular estadísticas
tail -n +2 "$OUTPUT_FILE" | awk -F',' '
{
    key = $1 "," $2 "," $3 "," $4 "," $6;
    sum[key] += $5;
    count[key]++;
    if (!(key in min_val) || $5 < min_val[key]) min_val[key] = $5;
    if (!(key in max_val) || $5 > max_val[key]) max_val[key] = $5;
}
END {
    for (key in sum) {
        split(key, parts, ",");
        avg = sum[key] / count[key];
        printf "%s,%s,%s,%s,%.4f,%.4f,%.4f,%s\n",
            parts[1], parts[2], parts[3], parts[4],
            avg, min_val[key], max_val[key], parts[5];
    }
}' | sort -t',' -k1,1 -k2,2 -k3,3n >> "$SUMMARY_FILE"

echo ""
echo ">>> TABLA RESUMEN:"
echo ""
column -t -s',' "$SUMMARY_FILE"
echo ""
echo "Archivos generados:"
echo "  ${OUTPUT_FILE}"
echo "  ${SUMMARY_FILE}"
