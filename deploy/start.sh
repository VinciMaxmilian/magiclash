#!/usr/bin/env bash
# Starts the API (loopback only) and the game server (public $PORT) in one container.
# If either process exits, the container exits too, so Render restarts the whole service.
set -u

cd /app/backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log &
API=$!

cd /app
node realtime/server.js &
GAME=$!

trap 'kill -TERM "$API" "$GAME" 2>/dev/null' TERM INT
wait -n "$API" "$GAME"
STATUS=$?
kill -TERM "$API" "$GAME" 2>/dev/null
wait
exit "$STATUS"
