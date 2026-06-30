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

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
