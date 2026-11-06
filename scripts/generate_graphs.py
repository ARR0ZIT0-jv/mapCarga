#!/usr/bin/env python3
"""
generate_graphs.py
Genera gráficas comparativas de rendimiento a partir de benchmark_summary.csv.
Produce gráficas de: tiempos de ejecución, speedup y eficiencia.

Uso: python3 scripts/generate_graphs.py
"""

import csv
import os
import sys

# Verificar si matplotlib está disponible
try:
    import matplotlib
    matplotlib.use('Agg')  # Backend sin GUI
    import matplotlib.pyplot as plt
    import matplotlib.ticker as ticker
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False

def load_summary(filepath):
    """Carga el CSV de resumen de benchmark."""
    data = []
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            row['workers'] = int(row['workers'])
            row['consultas'] = int(row['consultas'])
            row['tiempo_promedio_ms'] = float(row['tiempo_promedio_ms'])
            row['tiempo_min_ms'] = float(row['tiempo_min_ms'])
            row['tiempo_max_ms'] = float(row['tiempo_max_ms'])
            row['rutas'] = int(row['rutas'])
            data.append(row)
    return data

def get_sequential_time(data, dataset):
    """Obtiene el tiempo secuencial para un dataset."""
    for row in data:
        if row['version'] == 'sequential' and row['dataset'] == dataset:
            return row['tiempo_promedio_ms']
    return None

def generate_text_tables(data, output_dir):
    """Genera tablas en formato texto para la documentación."""
    datasets = ['small', 'medium', 'large']

    with open(os.path.join(output_dir, 'analysis.txt'), 'w') as f:
        f.write("=" * 70 + "\n")
        f.write("  ANÁLISIS DE RENDIMIENTO - BENCHMARK COMPLETO\n")
        f.write("=" * 70 + "\n\n")

        for ds in datasets:
            seq_time = get_sequential_time(data, ds)
            if seq_time is None:
                continue

            f.write(f"\n{'='*60}\n")
            f.write(f"  DATASET: {ds.upper()}\n")
            f.write(f"{'='*60}\n\n")

            # Tabla OpenMP
            f.write("  --- OpenMP ---\n")
            f.write(f"  {'Hilos':<8} {'Tiempo(ms)':<14} {'Speedup':<10} {'Eficiencia':<12}\n")
            f.write(f"  {'-'*44}\n")

            for row in data:
                if row['version'] == 'openmp' and row['dataset'] == ds:
                    t = row['tiempo_promedio_ms']
                    p = row['workers']
                    speedup = seq_time / t if t > 0 else 0
                    efficiency = speedup / p if p > 0 else 0
                    f.write(f"  {p:<8} {t:<14.2f} {speedup:<10.2f} {efficiency:<12.2%}\n")

            f.write("\n")

            # Tabla MPI
            f.write("  --- MPI ---\n")
            f.write(f"  {'Procs':<8} {'Tiempo(ms)':<14} {'Speedup':<10} {'Eficiencia':<12}\n")
            f.write(f"  {'-'*44}\n")

            for row in data:
                if row['version'] == 'mpi' and row['dataset'] == ds:
                    t = row['tiempo_promedio_ms']
                    p = row['workers']
                    speedup = seq_time / t if t > 0 else 0
                    efficiency = speedup / p if p > 0 else 0
                    f.write(f"  {p:<8} {t:<14.2f} {speedup:<10.2f} {efficiency:<12.2%}\n")

            f.write("\n")

            # Análisis de Amdahl
            # Estimar fracción serial usando speedup con mayor número de hilos
            omp_data = [(r['workers'], r['tiempo_promedio_ms'])
                        for r in data
                        if r['version'] == 'openmp' and r['dataset'] == ds]
            if omp_data:
                max_p, min_t = max(omp_data, key=lambda x: x[0])
                s_max = seq_time / min_t if min_t > 0 else 1
                # De S = 1 / (f + (1-f)/p) => f = (1/S - 1/p) / (1 - 1/p)
                if max_p > 1 and s_max > 0:
                    f_serial = (1/s_max - 1/max_p) / (1 - 1/max_p)
                    f.write(f"  Ley de Amdahl (estimación):\n")
                    f.write(f"    Fracción serial estimada: {f_serial:.4f} ({f_serial*100:.2f}%)\n")
                    f.write(f"    Fracción paralela: {1-f_serial:.4f} ({(1-f_serial)*100:.2f}%)\n")
                    s_max_teorico = 1 / f_serial if f_serial > 0 else float('inf')
                    f.write(f"    Speedup máximo teórico: {s_max_teorico:.2f}x\n")
                    f.write(f"    Speedup obtenido con {max_p} hilos: {s_max:.2f}x\n\n")

                # Ley de Gustafson
                f.write(f"  Ley de Gustafson (speedup escalado):\n")
                for p, t in omp_data:
                    if p > 1:
                        s_gustafson = p - f_serial * (p - 1)
                        f.write(f"    p={p}: S_gustafson = {s_gustafson:.2f}\n")
                f.write("\n")

    print(f"  Análisis guardado en: {os.path.join(output_dir, 'analysis.txt')}")

def generate_plots(data, output_dir):
    """Genera gráficas con matplotlib."""
    if not HAS_MATPLOTLIB:
        print("  matplotlib no disponible, omitiendo gráficas PNG")
        return

    datasets = ['small', 'medium', 'large']
    colors_omp = '#2196F3'
    colors_mpi = '#4CAF50'

    for ds in datasets:
        seq_time = get_sequential_time(data, ds)
        if seq_time is None:
            continue

        # --- Gráfica 1: Tiempos de ejecución ---
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.suptitle(f'Rendimiento - Dataset {ds.upper()}', fontsize=14, fontweight='bold')

        # OpenMP tiempos
        omp = [(r['workers'], r['tiempo_promedio_ms'])
               for r in data if r['version'] == 'openmp' and r['dataset'] == ds]
        omp.sort()
        if omp:
            x, y = zip(*omp)
            axes[0].bar([str(v) for v in x], y, color=colors_omp, alpha=0.8)
            axes[0].axhline(y=seq_time, color='red', linestyle='--', label=f'Secuencial ({seq_time:.1f} ms)')
            axes[0].set_xlabel('Número de hilos')
            axes[0].set_ylabel('Tiempo (ms)')
            axes[0].set_title('OpenMP - Tiempo de ejecución')
            axes[0].legend()

        # MPI tiempos
        mpi = [(r['workers'], r['tiempo_promedio_ms'])
               for r in data if r['version'] == 'mpi' and r['dataset'] == ds]
        mpi.sort()
        if mpi:
            x, y = zip(*mpi)
            axes[1].bar([str(v) for v in x], y, color=colors_mpi, alpha=0.8)
            axes[1].axhline(y=seq_time, color='red', linestyle='--', label=f'Secuencial ({seq_time:.1f} ms)')
            axes[1].set_xlabel('Número de procesos')
            axes[1].set_ylabel('Tiempo (ms)')
            axes[1].set_title('MPI - Tiempo de ejecución')
            axes[1].legend()

        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, f'tiempos_{ds}.png'), dpi=150)
        plt.close()

        # --- Gráfica 2: Speedup ---
        fig, ax = plt.subplots(figsize=(8, 5))
        ax.set_title(f'Speedup - Dataset {ds.upper()}', fontsize=14, fontweight='bold')

        if omp:
            x_omp = [p for p, _ in omp]
            s_omp = [seq_time / t for _, t in omp]
            ax.plot(x_omp, s_omp, 'o-', color=colors_omp, label='OpenMP', linewidth=2, markersize=8)

        if mpi:
            x_mpi = [p for p, _ in mpi]
            s_mpi = [seq_time / t for _, t in mpi]
            ax.plot(x_mpi, s_mpi, 's-', color=colors_mpi, label='MPI', linewidth=2, markersize=8)

        # Línea ideal
        max_x = max(max(x_omp) if omp else 1, max(x_mpi) if mpi else 1)
        ideal_x = list(range(1, max_x + 1))
        ax.plot(ideal_x, ideal_x, '--', color='gray', alpha=0.5, label='Ideal (lineal)')

        ax.set_xlabel('Número de workers (hilos/procesos)')
        ax.set_ylabel('Speedup S(p) = T(1)/T(p)')
        ax.legend()
        ax.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, f'speedup_{ds}.png'), dpi=150)
        plt.close()

        # --- Gráfica 3: Eficiencia ---
        fig, ax = plt.subplots(figsize=(8, 5))
        ax.set_title(f'Eficiencia - Dataset {ds.upper()}', fontsize=14, fontweight='bold')

        if omp:
            e_omp = [seq_time / (t * p) for p, t in omp]
            ax.plot(x_omp, e_omp, 'o-', color=colors_omp, label='OpenMP', linewidth=2, markersize=8)

        if mpi:
            e_mpi = [seq_time / (t * p) for p, t in mpi]
            ax.plot(x_mpi, e_mpi, 's-', color=colors_mpi, label='MPI', linewidth=2, markersize=8)

        ax.axhline(y=1.0, color='gray', linestyle='--', alpha=0.5, label='Ideal (100%)')
        ax.set_xlabel('Número de workers (hilos/procesos)')
        ax.set_ylabel('Eficiencia E(p) = S(p)/p')
        ax.yaxis.set_major_formatter(ticker.PercentFormatter(1.0))
        ax.legend()
        ax.grid(True, alpha=0.3)
        ax.set_ylim(0, 1.2)

        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, f'eficiencia_{ds}.png'), dpi=150)
        plt.close()

    print(f"  Gráficas guardadas en: {output_dir}/")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.join(script_dir, '..')
    summary_file = os.path.join(project_dir, 'results', 'tables', 'benchmark_summary.csv')
    graphs_dir = os.path.join(project_dir, 'results', 'graphs')
    tables_dir = os.path.join(project_dir, 'results', 'tables')

    os.makedirs(graphs_dir, exist_ok=True)

    if not os.path.exists(summary_file):
        print(f"Error: No se encontró {summary_file}")
        print("Ejecute primero: bash scripts/benchmark.sh")
        sys.exit(1)

    data = load_summary(summary_file)
    print(f"Cargados {len(data)} registros de benchmark")

    generate_text_tables(data, tables_dir)
    generate_plots(data, graphs_dir)

    print("\nGeneración completada.")

if __name__ == '__main__':
    main()
