# Reactor Desktop

A native-feeling desktop shell for the **Pi Coding Agent** CLI (`pi --mode rpc`).

<p align="left">
  <a href="https://github.com/DrOlu/reactor-desktop/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/DrOlu/reactor-desktop/ci.yml?branch=main&style=for-the-badge" /></a>
  <a href="https://github.com/DrOlu/reactor-desktop/releases"><img alt="Release" src="https://img.shields.io/github/v/release/DrOlu/reactor-desktop?include_prereleases&style=for-the-badge" /></a>
  <a href="./LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-6b7280?style=for-the-badge" /></a>
</p>

<p align="left">
  <img src="./assets/branding/pi-desktop-icon.svg" alt="Reactor Desktop app icon" width="120" />
</p>

Reactor Desktop is intentionally **minimal** and **extension-first**:
- the desktop app is the host/shell,
- the `pi` CLI is the runtime,
- packages/extensions provide optional behavior.

## About

**Author:** Hyperspace Technologies  
**Email:** reactor@hyperspace.ng

## Installation

Download the latest release for your platform from the [releases page](https://github.com/DrOlu/reactor-desktop/releases).

### Prerequisites

Install the Pi Coding Agent CLI:

```bash
npm install -g @mariozechner/pi-coding-agent
```

Notes:
- This installs a **public npm package** (`@mariozechner/pi-coding-agent`), so no npm auth token is required for normal users.
- Pi Desktop itself is distributed via **GitHub Releases** (not npm).

Then click **Retry** in-app.

## Development

```bash
npm install
npm run dev         # Frontend dev server
npm run build       # Full Tauri build
npm run check       # TypeScript type check
```

### Requirements

- Node.js 22+
- Rust (stable)
- Platform dependencies for Tauri v2

#### Linux

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

## License

MIT — Hyperspace Technologies
