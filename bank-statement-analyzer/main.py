"""
main.py
-------
FastAPI application for the Bank Statement Analyzer.

Endpoints:
  GET  /            → drag-and-drop UI
  POST /analyze     → single file → JSON metrics + base64 PDF
  POST /analyze-multi → multiple files → combined JSON + base64 PDF
  GET  /health      → liveness probe
"""

from __future__ import annotations

import base64
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

# Load .env file so OPENAI_API_KEY (and other secrets) are available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from analyzer import (
    analyze, analyze_multiple,
    EXCLUDE_KEYWORDS, NSF_KEYWORDS, LOAN_KEYWORDS,
)
from report_generator import generate_pdf

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Bank Statement Analyzer starting up…")
    yield
    logger.info("Bank Statement Analyzer shutting down.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Bank Statement Analyzer for CRM",
    description="Upload one or more bank statement PDFs/CSVs → JSON metrics + PDF report.",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

ALLOWED_EXTENSIONS = {"pdf", "csv"}
MAX_FILE_SIZE_MB   = 50


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _check_ext(filename: str) -> None:
    ext = (filename or "").lower().split(".")[-1]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '.{ext}'. Please upload a PDF or CSV.",
        )


def _tag_df(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame rows → tagged dicts for the UI transaction table."""
    rows = []
    for _, row in df.iterrows():
        desc = str(row["description"]).lower()
        amt  = float(row["amount"])
        if amt > 0:
            tag = "true-deposit" if not any(kw in desc for kw in EXCLUDE_KEYWORDS) else "deposit"
        elif any(kw in desc for kw in NSF_KEYWORDS):
            tag = "nsf"
        elif any(kw in desc for kw in LOAN_KEYWORDS):
            tag = "loan"
        else:
            tag = "debit"
        bal = row.get("balance", None)
        rows.append({
            "date":        row["date"].strftime("%Y-%m-%d"),
            "description": str(row["description"])[:80],
            "amount":      round(float(row["amount"]), 2),
            "balance":     round(float(bal), 2) if pd.notna(bal) else None,
            "row_class":   tag,
        })
    return rows


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def ui():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "bank-statement-analyzer", "version": "1.1.0"}


# ── Single file ─────────────────────────────────────────────────────────────

@app.post("/analyze", tags=["Analysis"])
async def analyze_statement(file: UploadFile = File(...)):
    """Upload one bank statement PDF or CSV."""
    _check_ext(file.filename or "")
    raw = await file.read()
    if len(raw) / 1024 / 1024 > MAX_FILE_SIZE_MB:
        raise HTTPException(413, f"File too large. Max {MAX_FILE_SIZE_MB} MB.")

    t0 = time.perf_counter()
    try:
        result = analyze(raw, file.filename or "statement.pdf")
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        logger.exception("Error analyzing %s", file.filename)
        raise HTTPException(500, f"Analysis failed: {exc}")

    metrics = result["metrics"]
    df      = result["dataframe"]

    try:
        pdf_bytes = generate_pdf(metrics, df)
    except Exception as exc:
        logger.exception("PDF generation failed")
        raise HTTPException(500, f"PDF generation failed: {exc}")

    elapsed = time.perf_counter() - t0
    stem    = (file.filename or "statement").rsplit(".", 1)[0]

    return JSONResponse({
        "success":      True,
        "elapsed_ms":   round(elapsed * 1000),
        "filename":     f"{stem}_analysis.pdf",
        "metrics":      metrics,
        "ai_assisted":  bool(metrics.get("ai_assisted", False)),
        "ai_assisted_message": metrics.get("ai_assisted_message"),
        "transactions": _tag_df(df),
        "pdf_base64":   base64.b64encode(pdf_bytes).decode(),
    })


# ── Multiple files ───────────────────────────────────────────────────────────

@app.post("/analyze-multi", tags=["Analysis"])
async def analyze_multi(files: List[UploadFile] = File(...)):
    """
    Upload multiple bank statement PDFs/CSVs.

    Returns combined metrics across all statements, per-file summaries,
    a full merged+deduplicated transaction list, and a single PDF report.
    """
    if not files:
        raise HTTPException(422, "No files provided.")
    if len(files) > 24:
        raise HTTPException(422, "Maximum 24 files per request.")

    # Read all files into memory
    file_data: list[tuple[bytes, str]] = []
    for f in files:
        _check_ext(f.filename or "")
        raw = await f.read()
        mb  = len(raw) / 1024 / 1024
        if mb > MAX_FILE_SIZE_MB:
            raise HTTPException(413, f"{f.filename} is too large ({mb:.1f} MB). Max {MAX_FILE_SIZE_MB} MB.")
        file_data.append((raw, f.filename or "statement.pdf"))

    t0 = time.perf_counter()
    try:
        result = analyze_multiple(file_data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        logger.exception("Error in multi-file analysis")
        raise HTTPException(500, f"Analysis failed: {exc}")

    metrics    = result["metrics"]
    df         = result["dataframe"]
    per_file   = result["per_file"]
    file_errors = result["file_errors"]

    try:
        pdf_bytes = generate_pdf(metrics, df)
    except Exception as exc:
        logger.exception("PDF generation failed (multi)")
        raise HTTPException(500, f"PDF generation failed: {exc}")

    elapsed = time.perf_counter() - t0
    logger.info("Multi-analysis complete in %.2fs – %d files, %d transactions",
                elapsed, len(per_file), len(df))

    return JSONResponse({
        "success":       True,
        "elapsed_ms":    round(elapsed * 1000),
        "files_processed": len(per_file),
        "files_failed":    len(file_errors),
        "file_errors":     file_errors,
        "per_file":        per_file,
        "metrics":         metrics,
        "ai_assisted":     bool(metrics.get("ai_assisted", False)),
        "ai_assisted_message": metrics.get("ai_assisted_message"),
        "transactions":    _tag_df(df),
        "pdf_base64":      base64.b64encode(pdf_bytes).decode(),
        "filename":        "combined_statement_analysis.pdf",
    })
