# ── Ruki FastAPI backend ──────────────────────────────────────────────────────
FROM python:3.11-slim

# Clean runtime: no .pyc clutter, unbuffered stdout so SSE/logs flush immediately.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first so this layer is cached across source changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

# Copy the remaining backend source (see .dockerignore for excluded cache files).
COPY . .

EXPOSE 8080

# Shell-form (not exec-form JSON array) so $PORT expands — Cloud Run injects
# PORT at runtime; docker-compose on the VM also sets PORT=8080, which this
# still honors, defaulting to 8080 either way. The leading `exec` replaces
# the shell process so uvicorn becomes PID 1 and receives SIGTERM directly on
# scale-down, instead of risking a hard-kill mid-SSE-stream.
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
