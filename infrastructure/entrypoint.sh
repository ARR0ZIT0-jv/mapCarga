#!/bin/bash
# =============================================================================
# entrypoint.sh
# Script de entrada para los contenedores del clúster MPI.
# Inicia el servidor SSH y mantiene el contenedor activo.
# =============================================================================

# Iniciar el servidor SSH (necesario para que MPI pueda conectarse)
/usr/sbin/sshd

echo "=== Nodo MPI iniciado ==="
echo "Hostname: $(hostname)"
echo "SSH activo en puerto 22"
echo "========================"

# Mantener el contenedor activo
# En el master, el usuario ejecutará comandos manualmente.
# Los workers solo necesitan estar disponibles para recibir procesos MPI.
tail -f /dev/null
