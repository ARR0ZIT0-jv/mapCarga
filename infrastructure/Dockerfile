# =============================================================================
# Dockerfile
# Imagen única para los 3 nodos del clúster MPI.
# Contiene: Ubuntu 22.04, g++, OpenMPI, OpenSSH, código compilado.
# =============================================================================
FROM ubuntu:22.04

# Evitar prompts interactivos durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# --- Instalar dependencias ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    libopenmpi-dev \
    openmpi-bin \
    openssh-server \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# --- Configurar SSH para MPI ---
# MPI necesita SSH sin contraseña para lanzar procesos en nodos remotos.
# Se genera un par de claves durante el build; como todos los contenedores
# usan la misma imagen, la misma clave funciona entre todos.

RUN mkdir -p /root/.ssh && \
    ssh-keygen -t rsa -b 2048 -f /root/.ssh/id_rsa -N "" -q && \
    cp /root/.ssh/id_rsa.pub /root/.ssh/authorized_keys && \
    chmod 600 /root/.ssh/authorized_keys && \
    chmod 700 /root/.ssh

# Configurar SSH client para no verificar host keys (necesario para MPI)
RUN echo "Host *\n\tStrictHostKeyChecking no\n\tUserKnownHostsFile /dev/null\n\tLogLevel ERROR" \
    > /root/.ssh/config && \
    chmod 600 /root/.ssh/config

# Configurar SSH server
RUN mkdir -p /run/sshd && \
    echo "PermitRootLogin yes" >> /etc/ssh/sshd_config && \
    echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config

# --- Copiar código fuente ---
WORKDIR /app
COPY src/ /app/src/
COPY data/ /app/data/
COPY scripts/ /app/scripts/

# --- Compilar las tres versiones ---
RUN mkdir -p /app/bin && \
    echo "Compilando version secuencial..." && \
    g++ -std=c++17 -O2 -Wall -o /app/bin/sequential \
        /app/src/sequential/main.cpp \
        /app/src/common/graph.cpp \
        /app/src/common/route.cpp && \
    echo "Compilando version OpenMP..." && \
    g++ -std=c++17 -O2 -Wall -fopenmp -o /app/bin/openmp \
        /app/src/openmp/main.cpp \
        /app/src/common/graph.cpp \
        /app/src/common/route.cpp && \
    echo "Compilando version MPI..." && \
    mpicxx -std=c++17 -O2 -Wall -o /app/bin/mpi_solver \
        /app/src/mpi/main.cpp \
        /app/src/common/graph.cpp \
        /app/src/common/route.cpp && \
    echo "Compilacion completada."

# --- Crear hostfile para MPI ---
# Lista de nodos disponibles para mpirun.
# Slots indica cuántos procesos puede ejecutar cada nodo.
RUN echo "master slots=1" > /app/hostfile && \
    echo "worker1 slots=1" >> /app/hostfile && \
    echo "worker2 slots=1" >> /app/hostfile

# --- Crear directorio de resultados ---
RUN mkdir -p /app/results/tables /app/results/graphs

# --- Script de entrada ---
# Inicia el servidor SSH y mantiene el contenedor activo.
COPY infrastructure/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/app/entrypoint.sh"]
