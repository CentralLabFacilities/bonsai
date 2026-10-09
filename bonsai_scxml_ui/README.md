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
  - in clf system in cargo in volume installed has do be linked as followed: 
    - rustup toolchain link tiago /vol/tiago/one/nightly/toolchains/1.90.0-x86_64-unknown-linux-gnu/
    - rustup default tiago

### Development

```bash
bun install
bun --bun run tauri:dev         # starts dev server with hot reload
```

### Production Build

```bash
bun --bun tauri:build       # produces src-tauri/target/release/bonsai-ui
```

The resulting binary (~5–10 MB) opens as a native window. It supports:

- **Open**: Native file picker for `.xml` / `.scxml` files
- **Speichern** (Save): Atomically replaces the currently open file (no dialog)
- **Speichern unter** (Save As): Opens save dialog when no file is open

---

## Verification

Use Node 22.23.3 (pinned in `.node-version`) and a Rust toolchain. Install dependencies with `npm ci`, then prepare Chromium with `npx playwright install --with-deps chromium` on supported Linux hosts, or `npx playwright install chromium` when browser libraries are already available.

```bash
npm run verify                 # lint, JS tests, headless Rust tests, build, browser tests
npm run test:rust              # native core and real atomic-file tests, no desktop GTK required
npm run test:browser           # real Chromium interaction and screenshot checks
npm run test:browser:update    # explicitly regenerate reviewed visual baselines
```

Verification uses an existing project-local Pixi Rust/linker environment when available and otherwise uses Cargo from PATH. Browser tests use deterministic API fixtures, not a running Bonsai service; screenshot fonts are pinned. CI runs the same verification command in Debian Bookworm and retains browser traces/screenshots on failure. Live desktop windows, native pickers, and quit behavior still require a graphical Tauri smoke check.

Atomic saves preserve existing bytes until replacement commits. On Unix, a directory-sync failure after replacement explicitly reports that the new file already committed but crash durability is unconfirmed. Replacement changes file identity and does not preserve ownership, ACLs, extended attributes, or hard-link aliases.

---

## Server Binary

A self-contained HTTP server with embedded frontend assets. No js runtime needed at deployment.

### Prerequisites

- **BUN** `https://github.com/oven-sh/bun/releases/`

### Build

```bash
bun install
bun --bun run build:binary               # produces target/bonsai-ui (~98 MB)
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

```text
src/
  App.jsx                         # Editor composition and controller wiring
  components/
    canvas/                       # Canvas, context actions, Code View and find
    graph/                        # Node and edge renderers, shared node chrome
    inspector/                    # Details, data, problems and runtime panels
    library/                      # Skill and behavior browsing
    inputs/                       # Typed values, expressions and state actions
    overlays/                     # Dialogs, shortcut help and introduction
    ui/                           # Shared controls and feedback primitives
    EditorChrome.jsx              # Top-level header and adaptive panel shell
    WorkflowTabBar.jsx            # Top-level document tabs
  hooks/
    graph/                        # Graph state, projections and mutations
      editorActions/              # Focused graph-editing actions
      transitionGraph/            # Transition and slot routing helpers
    interaction/                  # Selection, drag, clipboard and keyboard
    document/                     # Tabs, persistence, history and Rust bridge
    library/                      # Skill definitions, browsing and insertion
    editor/                       # Inspector coordination, preferences and replay
  utils/                          # Pure graph, SCXML and layout helpers
  tauri-client.js                 # Tauri IPC bridge
  server.js                       # Standalone server entry point
  embed-assets.js                 # Asset bundler
src-tauri/                        # Native backend and atomic file persistence
scripts/verify.mjs                # Unified verification runner
tests/                           # Unit, native-bridge and browser regressions
```
