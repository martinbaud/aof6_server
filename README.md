# All of Fabric 6 Server

Modded Minecraft server with the **All of Fabric 6** modpack (v1.10.1) for Minecraft 1.19.2.

## Requirements

- Java 17+
- 5 GB RAM minimum

## Installation

```bash
git clone https://github.com/martinbaud/aof6_server.git
cd aof6_server
java -jar serverstarter-2.4.0.jar
```

ServerStarter will automatically:
1. Download and install Fabric Loader 0.14.22
2. Download all modpack mods (~391 mods)
3. Prompt you to accept the Mojang EULA (type `TRUE` then Enter)
4. Start the server

## Structure

```
├── aof6_modpack.zip          # Modpack with CurseForge manifest
├── local_mods/               # Optional local mods
├── server-setup-config.yaml  # ServerStarter configuration
└── serverstarter-2.4.0.jar   # ServerStarter launcher
```

## Local Mods (Optional)

The `local_mods/` folder contains mods **not included** in the base AOF6 modpack:

| Mod | Description |
|-----|-------------|
| `immersive_aircraft-0.7.9` | Adds planes/airships. Same creator as Immersive Armors (included in AOF6). |
| `MysticalAgriculture-Refabricated-1.19.2-2.0.8` | Fix for XP capsule bug. |

### Disable Local Mods

For a **vanilla** AOF6 server (no custom mods), comment out the `localFiles` section in `server-setup-config.yaml`:

```yaml
# localFiles:
#   - from: local_mods/immersive_aircraft-0.7.9+1.19.2-fabric.jar
#     to: mods/immersive_aircraft-0.7.9+1.19.2-fabric.jar
```

Players won't need to install immersive_aircraft on their client.

## Configuration

- **RAM:** Configurable in `server-setup-config.yaml` (maxRam/minRam)
- **Port:** 25565 (default)
- **RCON:** 25575

## World

The `world/` folder is not included in the repo. To restore a world:

```bash
# Download from Google Drive (example)
gdown "FILE_URL"
unzip world_backup.zip
```

## Client

- **Modpack:** All of Fabric 6 v1.10.1
- **Additional mods (if enabled on server):** `immersive_aircraft-0.7.9`

## License

MIT
