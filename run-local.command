#!/bin/bash
set -e
cd "$(dirname "$0")"
PORT=8877
echo "Color Palette Studio will be served from:"
pwd
echo
echo "Open: http://localhost:${PORT}/"
echo "Press Ctrl+C to stop the server."
echo
exec python3 -m http.server "$PORT" --bind 127.0.0.1
