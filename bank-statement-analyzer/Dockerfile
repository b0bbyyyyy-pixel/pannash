# =====================================================================
# Bank Statement Analyzer – Dockerfile
# Base image: Python 3.12 slim
#
# WeasyPrint requires Cairo + Pango system libraries.
# Ollama is NOT bundled here – run it separately and set OLLAMA_HOST.
# =====================================================================

# Bookworm: stable Debian; avoid python:3.12-slim on cutting-edge where apt names drift.
# Do not put `#` comments inside a continued RUN line — the shell treats them as end-of-command.
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    ghostscript \
    poppler-utils \
    default-jre-headless \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# --- App setup --------------------------------------------------------
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create a non-root user for security
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# --- Runtime ----------------------------------------------------------
EXPOSE 8000

# Increase uvicorn workers for production (adjust to CPU count)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--log-level", "info"]
