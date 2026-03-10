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

# Accept EULA upfront
RUN mkdir -p /server && echo "eula=true" > eula.txt

# Run initial setup (download mods, install fabric)
# This is done at build time to speed up container starts
RUN java -jar serverstarter-2.4.0.jar || true

# Expose Minecraft port
EXPOSE 25565

# Start server
CMD ["java", "-Xmx6G", "-Xms4G", \
     "-XX:+UseG1GC", "-XX:+ParallelRefProcEnabled", \
     "-XX:MaxGCPauseMillis=100", "-XX:+UnlockExperimentalVMOptions", \
     "-jar", "serverstarter-2.4.0.jar"]
