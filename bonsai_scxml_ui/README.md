# Bonsai UI

### Quick Start

Requires Bonsai-scxml-web server to be running on localhost:8080

```bash
prefix=/tmp pixi run install
/tmp/bin/bonsai-ui

```


---

## Desktop App (Tauri) — Recommended

A native desktop application with file system access and direct save support.

### Prerequisites

- **BUN** `https://github.com/oven-sh/bun/releases/`
- **[Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)**: `apt install libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- **Cargo**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile default`

### Development

```bash
bun install
bun run tauri:dev         # starts dev server with hot reload
```

### Production Build

```bash
bun run tauri:build       # produces src-tauri/target/release/bonsai-ui
```

The resulting binary (~5–10 MB) opens as a native window. It supports:

- **Open**: Native file picker for `.xml` / `.scxml` files
- **Speichern** (Save): Directly overwrites the currently open file (no dialog)
- **Speichern unter** (Save As): Opens save dialog when no file is open

---

## Server Binary

A self-contained HTTP server with embedded frontend assets. No js runtime needed at deployment.

### Prerequisites

- **BUN** `https://github.com/oven-sh/bun/releases/`

### Build

```bash
bun installq
bun run build:binary               # produces target/bonsai-ui (~98 MB)
```

### Run

```bash
./target/bonsai-ui                 # serves on port 3000, proxies /api → localhost:8080

./target/bonsai-ui PORT=8080       # custom port

API_TARGET=http://other-host:9000 ./target/bonsai-ui   # custom API backend
```

The server automatically proxies `/api/*` requests to `http://localhost:8080/*` (stripping the `/api` prefix). Override with `API_TARGET`.

---

## Project Structure

```
bonsai_ui/
├── src/                          # React frontend
│   ├── components/               # UI components
│   ├── utils/                    # SCXML import/export, layout
│   └── tauri-client.js           # Tauri IPC bridge
├── src-tauri/                    # Rust/Tauri backend
│   ├── src/main.rs               # File open/save/read commands
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # App config
│   └── capabilities/             # Permission grants
├── build.sh                      # Unified build script
├── server.js                     # Standalone server entry point
├── embed-assets.js               # Asset bundler (base64 → binary)
└── target/                       # Build output (gitignored)
    └── bonsai-ui                 # Standalone binary
```
