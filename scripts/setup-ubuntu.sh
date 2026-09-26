#!/usr/bin/env bash
set -euo pipefail
sudo apt update
sudo apt install -y \
  build-essential pkg-config libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libdbus-1-dev patchelf \
  pulseaudio-utils gnome-keyring wl-clipboard xdg-utils
echo 'Dependências instaladas. Confira Node.js 22+ e Rust stable antes de executar npm ci.'
