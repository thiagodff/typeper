#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v gnome-extensions >/dev/null; then
  echo 'GNOME Shell não encontrado. Esta integração requer Ubuntu/GNOME 45 a 50.' >&2
  exit 1
fi
shell_major="$(gnome-shell --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
if (( shell_major < 45 || shell_major > 50 )); then
  echo "GNOME ${shell_major} fora do intervalo previsto (45–50). Consulte docs/WAYLAND.md." >&2
  exit 1
fi
extension_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/typeper@typeper.local"
mkdir -p "$extension_dir"
install -m 644 "$project_dir/gnome-extension/extension.js" "$project_dir/gnome-extension/metadata.json" "$project_dir/gnome-extension/stylesheet.css" "$extension_dir/"
if gnome-extensions enable typeper@typeper.local; then
  echo 'Extensão ativada. Abra o Typeper e adicione sua chave de API.'
else
  echo 'Arquivos instalados. Encerre a sessão do GNOME, entre novamente e execute:'
  echo 'gnome-extensions enable typeper@typeper.local'
fi
