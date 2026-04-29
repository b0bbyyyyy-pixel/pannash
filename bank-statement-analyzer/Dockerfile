# =====================================================================
# Bank Statement Analyzer – Dockerfile
# Base image: Python 3.12 slim
#
# WeasyPrint requires Cairo + Pango system libraries.
# Ollama is NOT bundled here – run it separately and set OLLAMA_HOST.
# =====================================================================

FROM python:3.12-slim

# --- System dependencies for WeasyPrint (Cairo, Pango, GDK-Pixbuf) --
RUN apt-get update && apt-get install -y --no-install-recommends \
    # WeasyPrint rendering stack
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    # PDF parsing helpers
    ghostscript \
    poppler-utils \
    # camelot / tabula java runtime (optional – comment out to save ~250 MB)
    default-jre-headless \
    # misc
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
