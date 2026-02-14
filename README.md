# Pi Desktop

A minimalist, Apple-like desktop application for the pi coding agent. Built with Tauri 2 (Rust + web frontend), inspired by Warp terminal and Codex app.

## Prerequisites

- **Node.js** >= 20
- **Rust** >= 1.70
- **pi CLI** - Must be installed globally (see below)

## Installing the pi CLI

Before running Pi Desktop, you need to install the pi coding agent CLI:

```bash
# Using npm
npm install -g @mariozechner/pi-coding-agent

# Verify installation
pi --version
```

If you don't have pi installed, the app will show an error with instructions.

## Development

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run tauri dev
```

This will open the app in development mode. The app will look for the `pi` CLI on your PATH.

## Building

Build the frontend:

```bash
npm run build:frontend
```

Build the Tauri app:

```bash
npm run tauri build
```

The built executable will be in `src-tauri/target/release/bundle/`.

## How It Works

Pi Desktop is a Tauri 2 application that:

1. Spawns the `pi --mode rpc` process as a child
2. Communicates with pi via JSON-lines over stdin/stdout
3. Renders a minimalist chat interface using Lit web components

The app expects the `pi` CLI to be available on your PATH. It will:
- Look for `pi` on PATH
- Show an error with installation instructions if not found

## Keyboard Shortcuts

- `Ctrl+N` / `Cmd+N` — New session
- `Ctrl+L` / `Cmd+L` — Focus input
- `Escape` — Abort current run
- `Ctrl+M` / `Cmd+M` — Cycle model (quick switch)
- `Ctrl+Shift+M` / `Cmd+Shift+M` — Open model selector

## Architecture

```
pi-desktop/
├── src/                    # Frontend (TypeScript + Lit)
│   ├── components/         # UI components (chat-view, titlebar, model-selector)
│   ├── rpc/               # RPC bridge (communicates with pi via Tauri IPC)
│   └── styles/            # CSS styles
├── src-tauri/              # Backend (Rust)
│   ├── src/lib.rs          # RPC process manager
│   └── tauri.conf.json     # Tauri configuration
└── package.json
```

## Tech Stack

- **Frontend**: Lit web components, Tailwind CSS v4
- **Backend**: Tauri 2 (Rust)
- **Protocol**: JSON-lines RPC over stdin/stdout
