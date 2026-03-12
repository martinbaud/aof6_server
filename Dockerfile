FROM eclipse-temurin:17-jdk-jammy

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy server files to staging area
WORKDIR /setup
COPY serverstarter-2.4.0.jar ./
COPY server-setup-config.yaml ./
COPY server.properties ./
COPY aof6_modpack.zip ./
COPY local_mods/ ./local_mods/

# Working directory (will be mounted as volume)
WORKDIR /server

# Expose Minecraft port and RCON port
EXPOSE 25565
EXPOSE 25575

# Entrypoint: copy files if first run, then start
CMD if [ ! -f /server/serverstarter-2.4.0.jar ]; then \
      echo "First run: copying server files..." && \
      cp -r /setup/* /server/; \
    fi && \
    echo "eula=true" > eula.txt && \
    if [ -n "$RCON_PASSWORD" ]; then \
      echo "Configuring RCON password..." && \
      sed -i "s/CHANGE_ME_IN_RAILWAY/$RCON_PASSWORD/g" server.properties; \
    fi && \
    java -Xmx6G -Xms4G \
    -XX:+UseG1GC -XX:+ParallelRefProcEnabled \
    -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions \
    -jar serverstarter-2.4.0.jar
