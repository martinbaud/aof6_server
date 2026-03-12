FROM eclipse-temurin:17-jdk-jammy

# Install dependencies including Node.js
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy server files to staging area
WORKDIR /setup
COPY serverstarter-2.4.0.jar ./
COPY server-setup-config.yaml ./
COPY server.properties ./
COPY aof6_modpack.zip ./
COPY local_mods/ ./local_mods/

# Setup backup server
WORKDIR /backup
COPY package.json ./
COPY backup-server.js ./
RUN npm install --omit=dev

# Working directory (will be mounted as volume)
WORKDIR /server

# Expose Minecraft port, RCON port, and Backup HTTP port
EXPOSE 25565
EXPOSE 25575
EXPOSE 3000

# Entrypoint: copy files if first run, then start both servers
CMD if [ ! -f /server/serverstarter-2.4.0.jar ]; then \
      echo "First run: copying server files..." && \
      cp -r /setup/* /server/; \
    fi && \
    echo "eula=true" > eula.txt && \
    echo "Updating server.properties from setup..." && \
    cp /setup/server.properties /server/server.properties && \
    if [ -n "$RCON_PASSWORD" ]; then \
      echo "Configuring RCON password..." && \
      sed -i "s/CHANGE_ME_IN_RAILWAY/$RCON_PASSWORD/g" /server/server.properties; \
    fi && \
    echo "Starting backup server..." && \
    node /backup/backup-server.js & \
    echo "Starting Minecraft server..." && \
    java -Xmx6G -Xms4G \
    -XX:+UseG1GC -XX:+ParallelRefProcEnabled \
    -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions \
    -jar serverstarter-2.4.0.jar
