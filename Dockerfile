FROM eclipse-temurin:17-jdk-jammy

WORKDIR /server

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy server files
COPY serverstarter-2.4.0.jar ./
COPY server-setup-config.yaml ./
COPY aof6_modpack.zip ./
COPY local_mods/ ./local_mods/

# Pre-accept EULA (Minecraft requirement)
RUN echo "eula=true" > eula.txt

# Expose Minecraft port
EXPOSE 25565

# Start script: setup + run (first start downloads mods ~10min)
CMD echo "eula=true" > eula.txt && \
    java -Xmx6G -Xms4G \
    -XX:+UseG1GC -XX:+ParallelRefProcEnabled \
    -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions \
    -jar serverstarter-2.4.0.jar
