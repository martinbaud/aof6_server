# All of Fabric 6 Server

Serveur Minecraft moddé avec le modpack **All of Fabric 6** (version 1.10.1) pour Minecraft 1.19.2.

## Prérequis

- Java 17+
- 5 Go de RAM minimum

## Installation

```bash
git clone https://github.com/martinbaud/aof6_server.git
cd aof6_server
java -jar serverstarter-2.4.0.jar
```

Le ServerStarter va automatiquement:
1. Télécharger et installer Fabric Loader 0.14.22
2. Télécharger tous les mods du modpack (~500 mods)
3. Lancer le serveur

## Structure

```
├── aof6_modpack.zip          # Modpack avec manifest CurseForge
├── local_mods/               # Mods locaux (non inclus dans le modpack)
│   ├── immersive_aircraft-0.7.9+1.19.2-fabric.jar
│   └── MysticalAgriculture-Refabricated-1.19.2-2.0.8.jar
├── server-setup-config.yaml  # Configuration ServerStarter
└── serverstarter-2.4.0.jar   # Launcher ServerStarter
```

## Configuration

- **RAM:** Modifiable dans `server-setup-config.yaml` (maxRam/minRam)
- **Port:** 25565 (par défaut)
- **RCON:** 25575

## Monde

Le dossier `world/` n'est pas inclus dans le repo. Pour restaurer un monde:

```bash
# Télécharger depuis Google Drive (exemple)
gdown "URL_DU_FICHIER"
unzip world_backup.zip
```

## Client

Les joueurs doivent utiliser **All of Fabric 6 v1.10.1** + le mod `immersive_aircraft-0.7.9`.
