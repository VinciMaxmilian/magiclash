# MagiClash server: FastAPI API + realtime game server in ONE container (one Render web service).
#
#   Render → :$PORT  Node (realtime/server.js)
#                      ├─ /ws        WebSocket game server
#                      ├─ /health    game server health
#                      └─ /api/*  →  proxy → 127.0.0.1:8000 uvicorn (FastAPI, not exposed)
#
# Secrets come only from Render's environment; .dockerignore keeps every .env out of the image.

# ── 1. Build the realtime bundle (includes @magiclash/shared) ─────────────────
FROM node:22-slim AS realtime
WORKDIR /src
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY realtime/package.json realtime/
COPY frontend/package.json frontend/
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund
COPY shared shared
COPY realtime realtime
RUN npm run build -w @magiclash/realtime

# ── 2. Runtime: Python + the node binary only ────────────────────────────────
FROM python:3.13-slim
COPY --from=realtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY --from=realtime /src/realtime/dist/server.js realtime/server.js
COPY deploy/start.sh start.sh
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh && useradd --system --uid 10001 app
USER app

ENV ENV=production \
    NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    API_PROXY_TARGET=http://127.0.0.1:8000 \
    API_URL=http://127.0.0.1:8000

CMD ["./start.sh"]
