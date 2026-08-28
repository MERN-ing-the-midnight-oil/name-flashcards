#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

echo "Name Flashcards"
echo "  This computer:  http://127.0.0.1:${PORT}"
if [[ -n "${IP}" ]]; then
  echo "  Your phone:     http://${IP}:${PORT}"
  echo "  (same Wi-Fi, then Add to Home Screen if you want)"
fi
echo
python3 -m http.server "$PORT"
