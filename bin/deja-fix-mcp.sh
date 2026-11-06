#!/usr/bin/env bash
# Launcher: loads .env next to the repo so no secrets live in MCP config.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
exec npx tsx src/server.ts
